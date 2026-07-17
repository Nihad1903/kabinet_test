import json
import logging
import os
import secrets
import sqlite3
import time
from contextlib import closing
from logging.handlers import RotatingFileHandler
from pathlib import Path

import httpx
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Kabinet API")
DATABASE_PATH = Path(__file__).with_name("students.db")
FRONTEND_DIST = Path(__file__).with_name("frontend").joinpath("dist")
LOGS_DIR = Path(__file__).with_name("logs")
VIRTUAL_TEACHER_URL = os.getenv("VIRTUAL_TEACHER_URL", "http://127.0.0.1:8000").rstrip(
    "/"
)
VIRTUAL_TEACHER_TOKEN = os.getenv("VIRTUAL_TEACHER_TOKEN", "dev-token")

STUDENT_FIELDS = "id, name, surname, age, group_name, specialty, email, username"

DEFAULT_STUDENTS = [
    (1, "Ali", "Məmmədov", 20, "641a2", "Komputer Elmləri", "ali@azmiu.edu.az", "ali", "ali123"),
    (2, "Leyla", "Həsənova", 19, "641a2", "Komputer Elmləri", "leyla@azmiu.edu.az", "leyla", "leyla123"),
    (3, "Nihad", "Quliyev", 21, "642a1", "İnformasiya Texnologiyaları", "nihad@azmiu.edu.az", "nihad", "nihad123"),
]

sessions: dict[str, dict] = {}


def setup_ai_logger() -> logging.Logger:
    """
    Sorğu izləmə jurnalı — logs/ai_queries.log
    Hər sətir bir JSON obyektidir (JSON Lines formatı), asan parse olunur:
      tail -f logs/ai_queries.log | jq .
    """
    LOGS_DIR.mkdir(exist_ok=True)
    logger = logging.getLogger("kabinet.ai")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(
        LOGS_DIR / "ai_queries.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


ai_logger = setup_ai_logger()


def log_ai_event(event: str, user: dict | None, request: Request, **extra) -> None:
    """Kimin sorğu göndərdiyini sessiyadan (PHPSESSID) götürüb jurnala yazır."""
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "event": event,
        "user_id": user.get("id") if user else None,
        "username": user.get("username") if user else None,
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }
    record.update(extra)
    ai_logger.info(json.dumps(record, ensure_ascii=False))


class LoginRequest(BaseModel):
    username: str
    password: str


class AiQueryRequest(BaseModel):
    question: str


def require_session(phpsessid: str | None) -> dict:
    if phpsessid is None or phpsessid not in sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return sessions[phpsessid]


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def student_to_dict(student: sqlite3.Row) -> dict:
    return {
        "id": student["id"],
        "name": student["name"],
        "surname": student["surname"],
        "age": student["age"],
        "group_name": student["group_name"],
        "specialty": student["specialty"],
        "email": student["email"],
        "username": student["username"],
    }


def init_database():
    with closing(get_connection()) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                surname TEXT NOT NULL,
                age INTEGER NOT NULL,
                group_name TEXT NOT NULL,
                specialty TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            )
            """
        )

        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(students)").fetchall()
        }
        if "username" not in columns:
            connection.execute("ALTER TABLE students ADD COLUMN username TEXT")
            connection.execute("ALTER TABLE students ADD COLUMN password TEXT")

        for student in DEFAULT_STUDENTS:
            connection.execute(
                """
                INSERT INTO students (
                    id, name, surname, age, group_name, specialty, email, username, password
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    surname = excluded.surname,
                    age = excluded.age,
                    group_name = excluded.group_name,
                    specialty = excluded.specialty,
                    email = excluded.email,
                    username = excluded.username,
                    password = excluded.password
                """,
                student,
            )

        connection.commit()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_database()


@app.get("/api")
def root():
    return {"message": "Kabinet API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/login")
def login(credentials: LoginRequest, response: Response):
    with closing(get_connection()) as connection:
        student = connection.execute(
            f"""
            SELECT {STUDENT_FIELDS}
            FROM students
            WHERE username = ? AND password = ?
            """,
            (credentials.username.strip(), credentials.password),
        ).fetchone()

    if student is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session_id = secrets.token_hex(32)
    sessions[session_id] = student_to_dict(student)
    response.set_cookie(
        key="PHPSESSID",
        value=session_id,
        httponly=True,
        path="/",
        samesite="lax",
    )
    return {"success": True}


@app.get("/me")
def me(phpsessid: str | None = Cookie(default=None, alias="PHPSESSID")):
    return require_session(phpsessid)


@app.post("/logout")
def logout(
    response: Response,
    phpsessid: str | None = Cookie(default=None, alias="PHPSESSID"),
):
    if phpsessid is not None:
        sessions.pop(phpsessid, None)

    response.delete_cookie(key="PHPSESSID", path="/")
    return {"success": True}


@app.get("/students/{student_id}")
def get_student(student_id: int):
    with closing(get_connection()) as connection:
        student = connection.execute(
            f"SELECT {STUDENT_FIELDS} FROM students WHERE id = ?",
            (student_id,),
        ).fetchone()

    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return student_to_dict(student)


@app.get("/ai/health")
def ai_health(
    request: Request,
    phpsessid: str | None = Cookie(default=None, alias="PHPSESSID"),
):
    try:
        user = require_session(phpsessid)
    except HTTPException:
        log_ai_event("health_unauthorized", None, request)
        raise
    log_ai_event("health_check", user, request)
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{VIRTUAL_TEACHER_URL}/health")
        if response.status_code != 200:
            return {"status": "error", "detail": "Virtual Teacher cavab vermir"}
        return {"status": "ok", "upstream": response.json()}
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Virtual Teacher əlçatan deyil: {exc}",
        ) from exc


@app.post("/ai/query")
def ai_query(
    payload: AiQueryRequest,
    request: Request,
    phpsessid: str | None = Cookie(default=None, alias="PHPSESSID"),
):
    try:
        user = require_session(phpsessid)
    except HTTPException:
        # Sessiyasız cəhdlər də izlənir (kim icazəsiz müraciət edib)
        log_ai_event("query_unauthorized", None, request)
        raise

    question = payload.question.strip()
    if not question:
        log_ai_event("query_empty", user, request)
        raise HTTPException(status_code=400, detail="Sual boş ola bilməz.")

    started = time.monotonic()
    log_ai_event("query_started", user, request, question=question)

    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{VIRTUAL_TEACHER_URL}/api/v1/query",
                json={"question": question},
                headers={"Authorization": f"Bearer {VIRTUAL_TEACHER_TOKEN}"},
                cookies={"PHPSESSID": phpsessid},
            )
    except httpx.RequestError as exc:
        log_ai_event(
            "query_upstream_unreachable",
            user,
            request,
            question=question,
            error=str(exc),
            duration_ms=round((time.monotonic() - started) * 1000),
        )
        raise HTTPException(
            status_code=503,
            detail=f"Virtual Teacher əlçatan deyil: {exc}",
        ) from exc

    duration_ms = round((time.monotonic() - started) * 1000)

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("detail", detail)
        except ValueError:
            pass
        log_ai_event(
            "query_failed",
            user,
            request,
            question=question,
            status=response.status_code,
            detail=str(detail)[:500],
            duration_ms=duration_ms,
        )
        raise HTTPException(status_code=response.status_code, detail=detail)

    result = response.json()
    log_ai_event(
        "query_answered",
        user,
        request,
        question=question,
        answer_preview=str(result.get("answer", ""))[:200],
        sources=result.get("sources", []),
        duration_ms=duration_ms,
    )
    return result


# Mount last so API routes take priority over static files.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

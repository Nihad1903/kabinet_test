import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Kabinet API")
DATABASE_PATH = Path(__file__).with_name("students.db")
FRONTEND_DIST = Path(__file__).with_name("frontend").joinpath("dist")

STUDENT_FIELDS = "id, name, surname, age, group_name, specialty, email, username"

DEFAULT_STUDENT_CREDENTIALS = [
    (1, "ali", "ali123"),
    (2, "leyla", "leyla123"),
    (3, "nihad", "nihad123"),
]


class LoginRequest(BaseModel):
    username: str
    password: str


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

        for student_id, username, password in DEFAULT_STUDENT_CREDENTIALS:
            connection.execute(
                """
                UPDATE students
                SET username = ?, password = ?
                WHERE id = ? AND (username IS NULL OR username = '' OR password IS NULL OR password = '')
                """,
                (username, password, student_id),
            )

        connection.commit()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if FRONTEND_DIST.is_dir():
    app.frontend("/", directory=str(FRONTEND_DIST))


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
def login(credentials: LoginRequest):
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

    return student_to_dict(student)


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

import "./style.css";

const API_BASE = "/api/v1";

const app = document.getElementById("app");

function renderLogin(errorMessage = "") {
  app.innerHTML = `
    <main class="page">
      <section class="card login-card">
        <div class="brand">
          <div class="brand-icon">K</div>
          <div>
            <p class="eyebrow">Tələbə kabineti</p>
            <h1>Daxil ol</h1>
          </div>
        </div>

        <p class="subtitle">Hesabınıza daxil olmaq üçün username və password daxil edin.</p>

        <form id="login-form" class="login-form">
          <label>
            Username
            <input type="text" name="username" autocomplete="username" required />
          </label>

          <label>
            Password
            <input type="password" name="password" autocomplete="current-password" required />
          </label>

          ${errorMessage ? `<p class="error">${errorMessage}</p>` : ""}

          <button type="submit">Daxil ol</button>
        </form>
      </section>
    </main>
  `;

  document.getElementById("login-form").addEventListener("submit", handleLogin);
}

function renderDashboard(student) {
  app.innerHTML = `
    <main class="page">
      <section class="card dashboard-card">
        <div class="dashboard-header">
          <div>
            <p class="eyebrow">Kabinet</p>
            <h1>${student.name} ${student.surname}</h1>
          </div>
          <button id="logout-btn" class="secondary-btn" type="button">Çıxış</button>
        </div>

        <div class="info-grid">
          <article class="info-item">
            <span>ID</span>
            <strong>${student.id}</strong>
          </article>
          <article class="info-item">
            <span>Yaş</span>
            <strong>${student.age}</strong>
          </article>
          <article class="info-item">
            <span>Qrup</span>
            <strong>${student.group_name}</strong>
          </article>
          <article class="info-item">
            <span>İxtisas</span>
            <strong>${student.specialty}</strong>
          </article>
          <article class="info-item">
            <span>Email</span>
            <strong>${student.email}</strong>
          </article>
          <article class="info-item">
            <span>Username</span>
            <strong>${student.username}</strong>
          </article>
        </div>
      </section>
    </main>
  `;

  document.getElementById("logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem("student");
    renderLogin();
  });
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const username = formData.get("username").trim();
  const password = formData.get("password");

  submitButton.disabled = true;
  submitButton.textContent = "Yoxlanılır...";

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      renderLogin(payload.detail || "Username və ya password yanlışdır.");
      return;
    }

    const loginData = await response.json();
    const studentResponse = await fetch(`${API_BASE}/students/${loginData.id}`);

    if (!studentResponse.ok) {
      renderLogin("Tələbə məlumatları yüklənmədi.");
      return;
    }

    const student = await studentResponse.json();
    sessionStorage.setItem("student", JSON.stringify(student));
    renderDashboard(student);
  } catch {
    renderLogin("Serverə qoşulmaq mümkün olmadı.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Daxil ol";
  }
}

async function loadStudentById(studentId) {
  const response = await fetch(`${API_BASE}/students/${studentId}`);

  if (!response.ok) {
    sessionStorage.removeItem("student");
    renderLogin();
    return;
  }

  const student = await response.json();
  sessionStorage.setItem("student", JSON.stringify(student));
  renderDashboard(student);
}

function bootstrap() {
  const savedStudent = sessionStorage.getItem("student");

  if (savedStudent) {
    try {
      const student = JSON.parse(savedStudent);
      loadStudentById(student.id);
      return;
    } catch {
      sessionStorage.removeItem("student");
    }
  }

  renderLogin();
}

bootstrap();

import "./style.css";

const app = document.getElementById("app");

const fetchOptions = { credentials: "include" };

async function fetchCurrentUser() {
  const response = await fetch("/me", fetchOptions);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

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
    <main class="page page-dashboard">
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

      <section class="card ai-card">
        <div class="dashboard-header">
          <div>
            <p class="eyebrow">Virtual Teacher</p>
            <h1>AI müəllim</h1>
          </div>
          <span id="ai-status" class="ai-status">yoxlanır...</span>
        </div>

        <p class="subtitle">Dərs materialları əsasında sual verin.</p>

        <form id="ai-form" class="ai-form">
          <label>
            Sualınız
            <textarea
              name="question"
              rows="3"
              placeholder="Məsələn: Kür çayı haqqında nə deyilir?"
              required
            ></textarea>
          </label>
          <button type="submit">Göndər</button>
        </form>

        <div id="ai-result" class="ai-result" hidden>
          <h2>Cavab</h2>
          <p id="ai-answer" class="ai-answer"></p>
          <div id="ai-sources-wrap" hidden>
            <h3>Mənbələr</h3>
            <ul id="ai-sources" class="ai-sources"></ul>
          </div>
        </div>
        <p id="ai-error" class="error" hidden></p>
      </section>
    </main>
  `;

  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("ai-form").addEventListener("submit", handleAiQuery);
  checkAiHealth();
}

async function checkAiHealth() {
  const statusEl = document.getElementById("ai-status");
  if (!statusEl) {
    return;
  }

  try {
    const response = await fetch("/ai/health", fetchOptions);
    if (!response.ok) {
      statusEl.textContent = "offline";
      statusEl.classList.add("offline");
      return;
    }
    statusEl.textContent = "online";
    statusEl.classList.add("online");
  } catch {
    statusEl.textContent = "offline";
    statusEl.classList.add("offline");
  }
}

async function handleAiQuery(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const question = new FormData(form).get("question").trim();
  const resultEl = document.getElementById("ai-result");
  const answerEl = document.getElementById("ai-answer");
  const sourcesWrap = document.getElementById("ai-sources-wrap");
  const sourcesEl = document.getElementById("ai-sources");
  const errorEl = document.getElementById("ai-error");

  errorEl.hidden = true;
  resultEl.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "Gözləyin...";

  try {
    const response = await fetch("/ai/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...fetchOptions,
      body: JSON.stringify({ question }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        typeof payload.detail === "string"
          ? payload.detail
          : "AI cavab verə bilmədi. Serveri yoxlayın.";
      errorEl.textContent =
        response.status === 503
          ? "Virtual Teacher hələ hazır deyil (modellər yüklənir). 1–2 dəqiqə gözləyib yenidən cəhd edin."
          : detail;
      errorEl.hidden = false;
      return;
    }

    answerEl.textContent = payload.answer || "Cavab yoxdur.";
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    sourcesEl.innerHTML = sources.map((source) => `<li>${source}</li>`).join("");
    sourcesWrap.hidden = sources.length === 0;
    resultEl.hidden = false;
  } catch {
    errorEl.textContent = "Virtual Teacher-ə qoşulmaq mümkün olmadı.";
    errorEl.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Göndər";
  }
}

async function handleLogout() {
  try {
    await fetch("/logout", { method: "POST", ...fetchOptions });
  } catch {
    // Session may already be invalid; still show login.
  }
  renderLogin();
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
    const response = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...fetchOptions,
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      renderLogin(payload.detail || "Username və ya password yanlışdır.");
      return;
    }

    const student = await fetchCurrentUser();
    if (!student) {
      renderLogin("Tələbə məlumatları yüklənmədi.");
      return;
    }

    renderDashboard(student);
  } catch {
    renderLogin("Serverə qoşulmaq mümkün olmadı.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Daxil ol";
  }
}

async function bootstrap() {
  const student = await fetchCurrentUser();
  if (student) {
    renderDashboard(student);
    return;
  }

  renderLogin();
}

bootstrap();

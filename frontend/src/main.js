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

function destroyChatbotWidget() {
  if (window.VirtualTeacherWidget) {
    window.VirtualTeacherWidget.destroy();
  }
}

async function initChatbotWidget() {
  if (!window.VirtualTeacherWidget) {
    console.warn("VirtualTeacherWidget yüklənməyib (chatbot.bundle.js).");
    return;
  }

  await window.VirtualTeacherWidget.init({
    apiBaseUrl: window.location.origin,
    chatEndpoint: "/ai/query",
    healthEndpoint: "/ai/health",
    authMode: "credentials",
    theme: "light",
    position: "right",
    title: "Virtual Teacher",
    assistantName: "AI Müəllim",
    placeholder: "Sualınızı yazın...",
    logo: window.location.origin + "/azmiu-logo.png",
  });
}

function renderLogin(errorMessage = "") {
  destroyChatbotWidget();

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
    </main>
  `;

  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  initChatbotWidget();
}

async function handleLogout() {
  destroyChatbotWidget();
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

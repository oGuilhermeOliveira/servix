function showMessage(formId, message) {
  const form = document.getElementById(formId);
  if (!form) return;

  const existing = form.querySelector(".form-message");
  if (existing) existing.remove();

  const feedback = document.createElement("p");
  feedback.className = "form-message";
  feedback.textContent = message;
  feedback.style.marginTop = "0.8rem";
  feedback.style.fontWeight = "700";
  feedback.style.color = "var(--primary)";
  form.appendChild(feedback);
}

const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeSwitcher = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu = document.getElementById("theme-menu");
const themeMenuItems = document.querySelectorAll(".theme-menu-item");

function getResolvedTheme(mode) {
  if (mode === "system") {
    return mediaQuery.matches ? "dark" : "light";
  }
  return mode;
}

function applyTheme(mode) {
  const resolvedTheme = getResolvedTheme(mode);
  document.documentElement.setAttribute("data-theme", resolvedTheme);
}

function updateThemeSelection(mode) {
  themeMenuItems.forEach(function (item) {
    const isActive = item.dataset.themeMode === mode;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function getInitialThemeMode() {
  const savedMode = localStorage.getItem(THEME_KEY);
  if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
    return savedMode;
  }
  return "system";
}

function closeThemeMenu() {
  if (!themeMenu || !themeFabButton) return;
  themeMenu.hidden = true;
  themeFabButton.setAttribute("aria-expanded", "false");
}

if (themeSwitcher && themeFabButton && themeMenu) {
  let currentThemeMode = getInitialThemeMode();
  applyTheme(currentThemeMode);
  updateThemeSelection(currentThemeMode);

  themeFabButton.addEventListener("click", function () {
    const isOpen = !themeMenu.hidden;
    themeMenu.hidden = isOpen;
    themeFabButton.setAttribute("aria-expanded", isOpen ? "false" : "true");
  });

  themeMenuItems.forEach(function (item) {
    item.addEventListener("click", function () {
      const nextMode = item.dataset.themeMode;
      if (!nextMode) return;
      currentThemeMode = nextMode;
      localStorage.setItem(THEME_KEY, currentThemeMode);
      applyTheme(currentThemeMode);
      updateThemeSelection(currentThemeMode);
      closeThemeMenu();
    });
  });

  document.addEventListener("click", function (event) {
    if (!themeSwitcher.contains(event.target)) {
      closeThemeMenu();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeThemeMenu();
    }
  });

  mediaQuery.addEventListener("change", function () {
    if (currentThemeMode === "system") {
      applyTheme("system");
    }
  });
}

const quickForm = document.getElementById("quick-form");
if (quickForm) {
  quickForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showMessage("quick-form", "Pedido enviado. Em breve voce recebera ate 4 orcamentos.");
    quickForm.reset();
  });
}

const proForm = document.getElementById("pro-form");
if (proForm) {
  proForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showMessage("pro-form", "Cadastro recebido. A equipe Servix vai entrar em contato.");
    proForm.reset();
  });
}

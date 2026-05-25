const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getResolvedTheme(mode) {
  if (mode === "system") return mediaQuery.matches ? "dark" : "light";
  return mode;
}

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", getResolvedTheme(mode));
}

function updateThemeSelection(mode) {
  document.querySelectorAll(".theme-menu-item").forEach(function (item) {
    const active = item.dataset.themeMode === mode;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

export function setupThemeSwitcher() {
  const switcher = document.getElementById("theme-switcher");
  const button = document.getElementById("theme-fab-button");
  const menu = document.getElementById("theme-menu");
  if (!switcher || !button || !menu) return;

  let current = localStorage.getItem(THEME_KEY) || "system";
  if (!["light", "dark", "system"].includes(current)) current = "system";
  applyTheme(current);
  updateThemeSelection(current);

  button.addEventListener("click", function () {
    const open = !menu.hidden;
    menu.hidden = open;
    button.setAttribute("aria-expanded", open ? "false" : "true");
  });

  document.querySelectorAll(".theme-menu-item").forEach(function (item) {
    item.addEventListener("click", function () {
      const next = item.dataset.themeMode;
      if (!next) return;
      current = next;
      localStorage.setItem(THEME_KEY, current);
      applyTheme(current);
      updateThemeSelection(current);
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", function (e) {
    if (!switcher.contains(e.target)) {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });

  mediaQuery.addEventListener("change", function () {
    if (current === "system") applyTheme("system");
  });
}

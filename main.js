import { supabase } from "./supabase-init.js";
import { getAreaSlugsForHeroCategory } from "./category-map.js";

const SESSION_SEARCH_KEY = "servix:last-search";
const GEO_TIMEOUT_MS = 10000;

function getClientCoords(timeoutMs) {
  return new Promise(function (resolve) {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = function (coords) {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(coords);
    };
    const t = setTimeout(function () {
      finish(null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      function () {
        finish(null);
      },
      { enableHighAccuracy: false, maximumAge: 120000, timeout: Math.max(2000, timeoutMs - 500) }
    );
  });
}

function showMessage(formId, message, isError) {
  const form = document.getElementById(formId);
  if (!form) return;

  const existing = form.querySelector(".form-message");
  if (existing) existing.remove();

  const feedback = document.createElement("p");
  feedback.className = "form-message";
  feedback.textContent = message;
  feedback.style.marginTop = "0.8rem";
  feedback.style.fontWeight = "700";
  feedback.style.color = isError ? "var(--danger, #c0392b)" : "var(--primary)";
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
  quickForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const category = document.getElementById("categoria")?.value?.trim() || "";
    const city = document.getElementById("cidade")?.value?.trim() || "";
    const areaSlugs = getAreaSlugsForHeroCategory(category);

    if (!supabase) {
      showMessage(
        "quick-form",
        "Configure supabase-config.js (copie de supabase-config.example.js) com URL e chave anon do Supabase.",
        true
      );
      return;
    }

    if (areaSlugs.length === 0) {
      showMessage("quick-form", "Selecione uma categoria válida.", true);
      return;
    }

    const coords = await getClientCoords(GEO_TIMEOUT_MS);
    const row = {
      category: category,
      city: city,
      client_lat: coords ? coords.lat : null,
      client_lng: coords ? coords.lng : null,
    };

    const { error } = await supabase.from("service_requests").insert(row);
    if (error) {
      console.error("Supabase service_requests:", error.message, error);
      showMessage(
        "quick-form",
        "Não foi possível enviar: " + (error.message || "verifique URL (…supabase.co), chave anon e o script SQL (migration_002_geo)."),
        true
      );
      return;
    }

    try {
      sessionStorage.setItem(
        SESSION_SEARCH_KEY,
        JSON.stringify({
          category: category,
          city: city,
          areaSlugs: areaSlugs,
          clientLat: coords ? coords.lat : null,
          clientLng: coords ? coords.lng : null,
        })
      );
    } catch (e) {
      console.warn("sessionStorage", e);
    }

    window.location.href = "resultados.html";
  });
}


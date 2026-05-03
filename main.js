import { supabase } from "./supabase-init.js";
import { getAreaSlugsForHeroCategory } from "./category-map.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function normalizeCep(raw) {
  return (raw || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(raw) {
  const digits = normalizeCep(raw);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

async function geocodeCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;

  // 1. Busca cidade/estado no ViaCEP
  try {
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const viaCepData = await viaCepRes.json();
    if (viaCepData.erro) return null;

    const city = viaCepData.localidade || "";
    const state = viaCepData.uf || "";

    // 2. Geocodifica com Nominatim
    const query = encodeURIComponent(`${digits}, ${city}, ${state}, Brasil`);
    const nominatimRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const nominatimData = await nominatimRes.json();

    if (nominatimData && nominatimData.length > 0) {
      return {
        lat: parseFloat(nominatimData[0].lat),
        lng: parseFloat(nominatimData[0].lon),
        city: city,
        state: state,
      };
    }

    // Se Nominatim não retornou coords, devolve pelo menos cidade
    return { lat: null, lng: null, city, state };
  } catch (e) {
    console.warn("geocodeCep falhou:", e);
    return null;
  }
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

// --- Tema ---
const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeSwitcher = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu = document.getElementById("theme-menu");
const themeMenuItems = document.querySelectorAll(".theme-menu-item");

function getResolvedTheme(mode) {
  if (mode === "system") return mediaQuery.matches ? "dark" : "light";
  return mode;
}
function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", getResolvedTheme(mode));
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
  if (savedMode === "light" || savedMode === "dark" || savedMode === "system") return savedMode;
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
    if (!themeSwitcher.contains(event.target)) closeThemeMenu();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeThemeMenu();
  });
  mediaQuery.addEventListener("change", function () {
    if (currentThemeMode === "system") applyTheme("system");
  });
}

// --- Formatação do CEP em tempo real ---
const cepClienteInput = document.getElementById("cep-cliente");
const cepCidadeHint = document.getElementById("cep-cidade-hint");

if (cepClienteInput) {
  cepClienteInput.addEventListener("input", function () {
    cepClienteInput.value = formatCep(cepClienteInput.value);
    if (cepCidadeHint) cepCidadeHint.textContent = "";
  });

  cepClienteInput.addEventListener("blur", async function () {
    const digits = normalizeCep(cepClienteInput.value);
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro && cepCidadeHint) {
        cepCidadeHint.textContent = `📍 ${data.localidade} / ${data.uf}`;
      }
    } catch (e) {
      // silencioso
    }
  });
}

// --- Formulário de busca ---
const quickForm = document.getElementById("quick-form");
if (quickForm) {
  quickForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const category = document.getElementById("categoria")?.value?.trim() || "";
    const cepRaw = cepClienteInput?.value || "";
    const areaSlugs = getAreaSlugsForHeroCategory(category);

    if (!supabase) {
      showMessage("quick-form", "Configure supabase-config.js com URL e chave anon do Supabase.", true);
      return;
    }
    if (areaSlugs.length === 0) {
      showMessage("quick-form", "Selecione uma categoria válida.", true);
      return;
    }
    const digits = normalizeCep(cepRaw);
    if (digits.length !== 8) {
      showMessage("quick-form", "Informe um CEP válido com 8 dígitos.", true);
      return;
    }

    showMessage("quick-form", "Buscando sua localização...", false);

    const geo = await geocodeCep(digits);
    const city = geo?.city || "";
    const state = geo?.state || "";
    const clientLat = geo?.lat || null;
    const clientLng = geo?.lng || null;

    const row = {
      category: category,
      city: city,
      client_lat: clientLat,
      client_lng: clientLng,
    };

    const { error } = await supabase.from("service_requests").insert(row);
    if (error) {
      console.error("Supabase service_requests:", error.message, error);
      showMessage("quick-form", "Não foi possível enviar: " + (error.message || "verifique a configuração."), true);
      return;
    }

    try {
      sessionStorage.setItem(
        SESSION_SEARCH_KEY,
        JSON.stringify({
          category,
          city,
          areaSlugs,
          clientLat,
          clientLng,
          cep: digits,
        })
      );
    } catch (e) {
      console.warn("sessionStorage", e);
    }

    window.location.href = "resultados.html";
  });
}

import { db } from "../js/firebase-init.js";
import { getAreaSlugsForHeroCategory } from "../js/category-map.js";

const SESSION_SEARCH_KEY = "servix:last-search";

// --- Helpers CEP ---
function normalizeCep(raw) {
  return (raw || "").replace(/\D/g, "").slice(0, 8);
}
function formatCep(raw) {
  const d = normalizeCep(raw);
  return d.length <= 5 ? d : d.slice(0, 5) + "-" + d.slice(5);
}

// Busca coords via Nominatim com fallback para cidade
async function nominatimSearch(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
    const res  = await fetch(url, {
      headers: {
        "Accept-Language": "pt-BR",
        "User-Agent": "ServixSolutions/1.0"
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.warn("Nominatim falhou:", e);
  }
  return null;
}

async function geocodeCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;

  // 1. ViaCEP → cidade e estado
  let city = "", state = "";
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    city  = data.localidade || "";
    state = data.uf || "";
  } catch (e) {
    console.warn("ViaCEP falhou:", e);
    return null;
  }

  // 2. Tenta geocodificar pelo CEP completo
  let coords = await nominatimSearch(`${digits}, ${city}, ${state}, Brasil`);

  // 3. Fallback: tenta só pela cidade
  if (!coords && city) {
    coords = await nominatimSearch(`${city}, ${state}, Brasil`);
  }

  return { lat: coords?.lat ?? null, lng: coords?.lng ?? null, city, state };
}

function showMessage(formId, message, isError) {
  const form = document.getElementById(formId);
  if (!form) return;
  const existing = form.querySelector(".form-message");
  if (existing) existing.remove();
  const p = document.createElement("p");
  p.className   = "form-message";
  p.textContent = message;
  p.style.cssText = `margin-top:.8rem;font-weight:700;color:${isError ? "var(--danger,#c0392b)" : "var(--primary)"}`;
  form.appendChild(p);
}

// --- Tema ---
const THEME_KEY      = "servix-theme-mode";
const mediaQuery     = window.matchMedia("(prefers-color-scheme: dark)");
const themeSwitcher  = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu      = document.getElementById("theme-menu");
const themeMenuItems = document.querySelectorAll(".theme-menu-item");

function getResolvedTheme(m) { return m === "system" ? (mediaQuery.matches ? "dark" : "light") : m; }
function applyTheme(m) { document.documentElement.setAttribute("data-theme", getResolvedTheme(m)); }
function updateThemeSelection(m) {
  themeMenuItems.forEach(i => {
    const a = i.dataset.themeMode === m;
    i.classList.toggle("active", a);
    i.setAttribute("aria-pressed", a ? "true" : "false");
  });
}
function closeThemeMenu() {
  if (themeMenu)      themeMenu.hidden = true;
  if (themeFabButton) themeFabButton.setAttribute("aria-expanded", "false");
}
function getInitialThemeMode() {
  const s = localStorage.getItem(THEME_KEY);
  return ["light","dark","system"].includes(s) ? s : "system";
}

if (themeSwitcher && themeFabButton && themeMenu) {
  let cur = getInitialThemeMode();
  applyTheme(cur); updateThemeSelection(cur);
  themeFabButton.addEventListener("click", () => {
    const open = !themeMenu.hidden;
    themeMenu.hidden = open;
    themeFabButton.setAttribute("aria-expanded", open ? "false" : "true");
  });
  themeMenuItems.forEach(i => i.addEventListener("click", () => {
    cur = i.dataset.themeMode;
    localStorage.setItem(THEME_KEY, cur);
    applyTheme(cur); updateThemeSelection(cur); closeThemeMenu();
  }));
  document.addEventListener("click", e => { if (!themeSwitcher.contains(e.target)) closeThemeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeThemeMenu(); });
  mediaQuery.addEventListener("change", () => { if (cur === "system") applyTheme("system"); });
}

// --- Máscara de telefone ---
function formatPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? "(" + d : d;
  if (d.length <= 6)  return "(" + d.slice(0,2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
  return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
}
const clientPhoneInput = document.getElementById("client-phone");
if (clientPhoneInput) {
  clientPhoneInput.addEventListener("input", () => {
    clientPhoneInput.value = formatPhone(clientPhoneInput.value);
  });
}

// --- Máscara e hint do CEP ---
const cepInput = document.getElementById("cep-cliente");
const cepHint  = document.getElementById("cep-cidade-hint");

if (cepInput) {
  cepInput.addEventListener("input", () => {
    cepInput.value = formatCep(cepInput.value);
    if (cepHint) cepHint.textContent = "";
  });
  cepInput.addEventListener("blur", async () => {
    const digits = normalizeCep(cepInput.value);
    if (digits.length !== 8) return;
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro && cepHint) {
        cepHint.textContent = `📍 ${data.localidade} / ${data.uf}`;
      }
    } catch (e) { /* silencioso */ }
  });
}

// --- Formulário de busca ---
const quickForm = document.getElementById("quick-form");
if (quickForm) {
  quickForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const category    = document.getElementById("categoria")?.value?.trim()     || "";
    const clientName  = document.getElementById("client-name")?.value?.trim()   || "";
    const clientPhone = document.getElementById("client-phone")?.value?.trim()  || "";
    const cepRaw      = cepInput?.value || "";
    const areaSlugs   = getAreaSlugsForHeroCategory(category);

    if (!db) {
      showMessage("quick-form", "Configure firebase-config.js com as credenciais do Firebase.", true);
      return;
    }
    if (areaSlugs.length === 0) {
      showMessage("quick-form", "Selecione uma categoria válida.", true);
      return;
    }
    const digits = normalizeCep(cepRaw);
    if (digits.length !== 8) {
      showMessage("quick-form", "Informe um CEP com 8 dígitos.", true);
      return;
    }

    // Mostra feedback de carregamento
    const submitBtn = quickForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Buscando..."; }
    showMessage("quick-form", "Buscando sua localização...", false);

    const geo = await geocodeCep(digits);

    // Mesmo sem coords, prossegue (não bloqueia o fluxo)
    const city      = geo?.city  || "";
    const state     = geo?.state || "";
    const clientLat = geo?.lat   ?? null;
    const clientLng = geo?.lng   ?? null;

    const { error } = await db.from("service_requests").insert({
      category,
      city,
      client_lat:   clientLat,
      client_lng:   clientLng,
      client_name:  clientName,
      client_phone: clientPhone,
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Receber orcamentos gratis"; }

    if (error) {
      console.error("service_requests:", error);
      showMessage("quick-form", "Não foi possível enviar: " + (error.message || "verifique a configuração."), true);
      return;
    }

    try {
      sessionStorage.setItem(SESSION_SEARCH_KEY, JSON.stringify({
        category, city, state, cep: digits,
        areaSlugs, clientLat, clientLng,
        clientName, clientPhone,
      }));
    } catch (e) { console.warn("sessionStorage:", e); }

    window.location.href = "resultados.html";
  });
}
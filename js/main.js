import { supabase } from "./supabase-init.js";
import { initServiceSearch } from "./service-search.js";
import { searchServices } from "./service-catalog.js";

const SESSION_SEARCH_KEY = "servix:last-search";

// --- CEP ---
function normalizeCep(raw) { return (raw || "").replace(/\D/g, "").slice(0, 8); }
function formatCep(raw) {
  const d = normalizeCep(raw);
  return d.length <= 5 ? d : d.slice(0, 5) + "-" + d.slice(5);
}

// --- Telefone ---
function formatPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? "(" + d : d;
  if (d.length <= 6)  return "(" + d.slice(0,2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
  return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
}

// --- Geocodificação ---
async function nominatimSearch(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR", "User-Agent": "ServixSolutions/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) { console.warn("Nominatim:", e); }
  return null;
}

async function geocodeCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;
  let city = "", state = "";
  try {
    const data = await (await fetch(`https://viacep.com.br/ws/${digits}/json/`)).json();
    if (data.erro) return null;
    city = data.localidade || ""; state = data.uf || "";
  } catch (e) { return null; }
  let coords = await nominatimSearch(`${digits}, ${city}, ${state}, Brasil`);
  if (!coords && city) coords = await nominatimSearch(`${city}, ${state}, Brasil`);
  return { lat: coords?.lat ?? null, lng: coords?.lng ?? null, city, state };
}

function showMessage(formId, msg, isError) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelector(".form-message")?.remove();
  if (!msg) return;
  const p = document.createElement("p");
  p.className = "form-message";
  p.textContent = msg;
  p.style.cssText = `margin-top:.8rem;font-weight:700;color:${isError ? "var(--danger,#c0392b)" : "var(--primary)"}`;
  form.appendChild(p);
}

// --- Tema ---
const THEME_KEY = "servix-theme-mode";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function resolveTheme(m) { return m === "system" ? (mq.matches ? "dark" : "light") : m; }
function applyTheme(m) { document.documentElement.setAttribute("data-theme", resolveTheme(m)); }
function updateSel(m) {
  document.querySelectorAll(".theme-menu-item").forEach(i => {
    const a = i.dataset.themeMode === m;
    i.classList.toggle("active", a);
    i.setAttribute("aria-pressed", a ? "true" : "false");
  });
}
(function setupTheme() {
  const sw   = document.getElementById("theme-switcher");
  const btn  = document.getElementById("theme-fab-button");
  const menu = document.getElementById("theme-menu");
  if (!sw || !btn || !menu) return;
  let cur = localStorage.getItem(THEME_KEY) || "system";
  if (!["light","dark","system"].includes(cur)) cur = "system";
  applyTheme(cur); updateSel(cur);
  btn.addEventListener("click", () => {
    const o = !menu.hidden; menu.hidden = o;
    btn.setAttribute("aria-expanded", o ? "false" : "true");
  });
  document.querySelectorAll(".theme-menu-item").forEach(i => i.addEventListener("click", () => {
    cur = i.dataset.themeMode;
    localStorage.setItem(THEME_KEY, cur);
    applyTheme(cur); updateSel(cur);
    menu.hidden = true; btn.setAttribute("aria-expanded", "false");
  }));
  document.addEventListener("click", e => {
    if (!sw.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded","false"); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { menu.hidden = true; btn.setAttribute("aria-expanded","false"); }
  });
  mq.addEventListener("change", () => { if (cur === "system") applyTheme("system"); });
})();

// --- Máscara telefone ---
const phoneInput = document.getElementById("client-phone");
if (phoneInput) {
  phoneInput.addEventListener("input", () => { phoneInput.value = formatPhone(phoneInput.value); });
}

// --- CEP hint ---
const cepInput = document.getElementById("cep-cliente");
const cepHint  = document.getElementById("cep-cidade-hint");
if (cepInput) {
  cepInput.addEventListener("input", () => {
    cepInput.value = formatCep(cepInput.value);
    if (cepHint) cepHint.textContent = "";
  });
  cepInput.addEventListener("blur", async () => {
    const d = normalizeCep(cepInput.value);
    if (d.length !== 8) return;
    try {
      const data = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
      if (!data.erro && cepHint) cepHint.textContent = `📍 ${data.localidade} / ${data.uf}`;
    } catch {}
  });
}

// --- Autocomplete de serviço ---
const serviceRoot   = document.getElementById("service-search");
const serviceSearch = serviceRoot ? initServiceSearch(serviceRoot) : null;
const serviceInput  = serviceRoot?.querySelector("[data-service-input]");

// Hint de "não encontrado" abaixo do campo
let hintEl = document.getElementById("service-hint");
if (!hintEl && serviceRoot) {
  hintEl = document.createElement("p");
  hintEl.id = "service-hint";
  hintEl.className = "form-hint";
  hintEl.style.cssText = "color:var(--danger,#c0392b);margin-top:0.3rem";
  hintEl.hidden = true;
  serviceRoot.insertAdjacentElement("afterend", hintEl);
}

let debounceTimer = null;
if (serviceInput && hintEl) {
  serviceInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = serviceInput.value.trim();
    hintEl.hidden = true;
    hintEl.textContent = "";
    if (q.length < 2) return;
    debounceTimer = setTimeout(() => {
      if (serviceSearch?.getSelection?.()) return;
      const hits = searchServices(q, 1);
      if (hits.length === 0) {
        hintEl.textContent = "Serviço não encontrado. Tente outro termo.";
        hintEl.hidden = false;
      }
    }, 500);
  });
  serviceRoot.addEventListener("mousedown", () => {
    hintEl.hidden = true;
    hintEl.textContent = "";
    clearTimeout(debounceTimer);
  });
}

// Card do prestador: muda se logado
if (supabase) {
  supabase.auth.getUser().then(({ data }) => {
    if (data?.user) {
      const title = document.getElementById("pro-card-title");
      const desc  = document.getElementById("pro-card-desc");
      const btn   = document.getElementById("pro-card-btn");
      if (title) title.textContent = "Acesse sua conta";
      if (desc)  desc.hidden = true;
      if (btn) { btn.textContent = "Acesse seu painel"; btn.href = "janelas/dashboard.html"; }
    }
  });
}

// --- Submit ---
const quickForm = document.getElementById("quick-form");
if (quickForm) {
  quickForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    // validate() agora aceita texto digitado sem clique obrigatório na lista
    const service     = serviceSearch?.validate?.() || null;
    const clientName  = document.getElementById("client-name")?.value?.trim()  || "";
    const clientPhone = document.getElementById("client-phone")?.value?.trim() || "";
    const cepRaw      = cepInput?.value || "";

    if (!supabase) {
      showMessage("quick-form", "Configure supabase-config.js.", true);
      return;
    }
    if (!service?.slug) {
      showMessage("quick-form", "Digite o serviço desejado e selecione uma opção da lista.", true);
      serviceInput?.focus();
      return;
    }
    const digits = normalizeCep(cepRaw);
    if (digits.length !== 8) {
      showMessage("quick-form", "Informe um CEP com 8 dígitos.", true);
      return;
    }

    const submitBtn = quickForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Buscando..."; }
    showMessage("quick-form", "Buscando sua localização...", false);

    const geo       = await geocodeCep(digits);
    const city      = geo?.city  || "";
    const state     = geo?.state || "";
    const clientLat = geo?.lat   ?? null;
    const clientLng = geo?.lng   ?? null;

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Ver profissionais perto de mim"; }

    try {
      sessionStorage.setItem(SESSION_SEARCH_KEY, JSON.stringify({
        category:     service.label,
        serviceGroup: service.group,
        areaSlug:     service.slug,
        areaSlugs:    [service.slug],
        city, state, cep: digits,
        clientLat, clientLng,
        clientName, clientPhone,
        pendingRequest: true,
      }));
    } catch (ex) { console.warn("sessionStorage:", ex); }

    // index.html está na raiz; janelas/ é subpasta
    window.location.href = "janelas/resultados.html";
  });
}
import { db } from "./firebase-init.js";
import { initServiceSearch } from "./service-search.js";
import { searchServices } from "./service-catalog.js";
import {
  fetchRecentTestimonials,
  formatRatingValue,
  globalAverageRating,
  renderStarRating,
  resolveAreaLabel,
} from "./provider-reviews.js";

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

async function loadTestimonials() {
  const host = document.getElementById("testimonials-list");
  const trustEl = document.querySelector(".hero .trust");
  if (!host) return;

  if (!db) {
    host.innerHTML =
      '<blockquote class="testimonial-placeholder">Depoimentos aparecerão quando o Firebase estiver configurado.</blockquote>';
    return;
  }

  const items = await fetchRecentTestimonials(db, 9);
  const avg = globalAverageRating(items);

  if (trustEl && avg != null) {
    trustEl.textContent =
      formatRatingValue(avg) + " de avaliação média | Atendimento no Alto Tietê";
  }

  host.replaceChildren();

  if (!items.length) {
    host.innerHTML =
      '<blockquote class="testimonial-placeholder">Seja o primeiro a avaliar um prestador após um serviço concluído.</blockquote>';
    return;
  }

  items.forEach(function (review) {
    const block = document.createElement("blockquote");
    block.className = "testimonial-item";

    const head = document.createElement("div");
    head.className = "testimonial-head";
    const name = document.createElement("strong");
    name.textContent = (review.client_name || "Cliente").trim();
    head.appendChild(name);
    head.appendChild(renderStarRating(review.rating, { showValue: true }));
    block.appendChild(head);

    const area = document.createElement("p");
    area.className = "testimonial-area";
    area.textContent = resolveAreaLabel(review);
    block.appendChild(area);

    const quote = document.createElement("p");
    quote.className = "testimonial-quote";
    if (review.comment && String(review.comment).trim()) {
      quote.textContent = `"${String(review.comment).trim()}"`;
    } else {
      quote.textContent = "Serviço avaliado na plataforma.";
    }
    block.appendChild(quote);

    host.appendChild(block);
  });
}

loadTestimonials();

/** Rolagem suave ao clicar nos links âncora do menu (compensa header sticky). */
function setupSmoothNavScroll() {
  const topbar = document.querySelector(".topbar");
  const scrollOffset = () => (topbar ? topbar.offsetHeight : 74) + 12;

  document.querySelectorAll('.menu a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - scrollOffset();
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      history.pushState(null, "", hash);
    });
  });

  const brand = document.querySelector(".brand[href='#'], .brand[href='']");
  if (brand) {
    brand.addEventListener("click", function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      history.pushState(null, "", window.location.pathname);
    });
  }
}

setupSmoothNavScroll();

const DASHBOARD_HREF = "janelas/dashboard.html";
const PANEL_LABEL = "Acesse o Painel";

function applyHomePageForLoggedInProvider(isLoggedIn) {
  const navProBtn = document.getElementById("nav-pro-btn");
  const heroProBtn = document.getElementById("hero-pro-btn");
  const proCardTitle = document.getElementById("pro-card-title");
  const proCardDesc = document.getElementById("pro-card-desc");
  const proCardBtn = document.getElementById("pro-card-btn");

  if (isLoggedIn) {
    if (navProBtn) {
      navProBtn.textContent = PANEL_LABEL;
      navProBtn.href = DASHBOARD_HREF;
    }
    if (heroProBtn) {
      heroProBtn.textContent = PANEL_LABEL;
      heroProBtn.href = DASHBOARD_HREF;
    }
    if (proCardTitle) proCardTitle.textContent = "Acesse sua conta";
    if (proCardDesc) proCardDesc.hidden = true;
    if (proCardBtn) {
      proCardBtn.textContent = PANEL_LABEL;
      proCardBtn.href = DASHBOARD_HREF;
    }
    return;
  }

  if (navProBtn) {
    navProBtn.textContent = "Seja profissional";
    navProBtn.href = "janelas/prestador.html";
  }
  if (heroProBtn) {
    heroProBtn.textContent = "Quero ser profissional";
    heroProBtn.href = "janelas/prestador.html";
  }
  if (proCardTitle) proCardTitle.textContent = "Cadastro em página dedicada";
  if (proCardDesc) proCardDesc.hidden = false;
  if (proCardBtn) {
    proCardBtn.textContent = "Ir para cadastro do prestador";
    proCardBtn.href = "janelas/prestador.html";
  }
}

function setupHomeAuthNav() {
  if (!db) return;
  db.auth.getUser().then(({ data }) => {
    applyHomePageForLoggedInProvider(Boolean(data?.user));
  });
  db.auth.onAuthStateChange(function () {
    db.auth.getUser().then(({ data }) => {
      applyHomePageForLoggedInProvider(Boolean(data?.user));
    });
  });
}

setupHomeAuthNav();

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

    if (!db) {
      showMessage("quick-form", "Configure firebase-config.js.", true);
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
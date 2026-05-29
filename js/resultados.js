import { db } from "./firebase-init.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function providerSlugs(row) {
  return (row.provider_service_areas || []).map(l => l.service_areas?.slug).filter(Boolean);
}

function formatAreas(row) {
  const names = (row.provider_service_areas || []).map(l => l.service_areas?.name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function readSearchSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_SEARCH_KEY)); } catch { return null; }
}

function writeSearchSession(data) {
  try { sessionStorage.setItem(SESSION_SEARCH_KEY, JSON.stringify(data)); } catch { /* */ }
}

async function submitRequest(search) {
  if (!db || search.requestSubmitted) return null;

  const payload = {
    category: search.category || "Servico",
    city: search.city || "",
    client_lat: search.clientLat ?? null,
    client_lng: search.clientLng ?? null,
    client_name: search.clientName || null,
    client_phone: search.clientPhone || null,
    area_slug: search.areaSlug || search.areaSlugs?.[0] || null,
  };

  let { error } = await db.from("service_requests").insert(payload);
  if (error && payload.area_slug) {
    const fallback = { ...payload };
    delete fallback.area_slug;
    ({ error } = await db.from("service_requests").insert(fallback));
  }
  if (!error) {
    writeSearchSession({ ...search, pendingRequest: false, requestSubmitted: true });
  }
  return error;
}

// --- Tema ---
const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeSwitcher = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu = document.getElementById("theme-menu");
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
function closeThemeMenu() { if (themeMenu) themeMenu.hidden = true; if (themeFabButton) themeFabButton.setAttribute("aria-expanded", "false"); }

if (themeSwitcher && themeFabButton && themeMenu) {
  let cur = localStorage.getItem(THEME_KEY) || "system";
  if (!["light", "dark", "system"].includes(cur)) cur = "system";
  applyTheme(cur); updateThemeSelection(cur);
  themeFabButton.addEventListener("click", () => { const o = !themeMenu.hidden; themeMenu.hidden = o; themeFabButton.setAttribute("aria-expanded", o ? "false" : "true"); });
  themeMenuItems.forEach(i => i.addEventListener("click", () => {
    cur = i.dataset.themeMode;
    localStorage.setItem(THEME_KEY, cur);
    applyTheme(cur);
    updateThemeSelection(cur);
    closeThemeMenu();
  }));
  document.addEventListener("click", e => { if (!themeSwitcher.contains(e.target)) closeThemeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeThemeMenu(); });
  mediaQuery.addEventListener("change", () => { if (cur === "system") applyTheme("system"); });
}

// --- Resultados ---
const titleEl = document.getElementById("results-title");
const subtitleEl = document.getElementById("results-subtitle");
const listEl = document.getElementById("results-list");
const emptyEl = document.getElementById("results-empty");

async function run() {
  let search = readSearchSession();
  const slugs = search?.areaSlugs?.length
    ? search.areaSlugs
    : search?.areaSlug
      ? [search.areaSlug]
      : [];

  if (!search || slugs.length === 0) {
    window.location.replace("../index.html");
    return;
  }

  if (search.pendingRequest && !search.requestSubmitted) {
    await submitRequest(search);
    search = readSearchSession() || search;
  }

  const serviceLabel = search.category || "seu servico";
  const groupLabel = search.serviceGroup ? ` (${search.serviceGroup})` : "";

  if (titleEl) titleEl.textContent = "Profissionais para " + serviceLabel;

  const hasCoords = search.clientLat != null && search.clientLng != null;

  if (subtitleEl) {
    const cepFmt = search.cep ? ` (CEP ${search.cep.slice(0, 5)}-${search.cep.slice(5)})` : "";
    const locText = search.city ? `Regiao: ${search.city}${cepFmt}. ` : "";
    const geoHint = hasCoords
      ? "Ordenados pela distancia ate voce. Em breve voce recebera orcamentos."
      : "Profissionais disponiveis na sua busca. Em breve voce recebera orcamentos.";
    subtitleEl.textContent = locText + groupLabel.trim() + (groupLabel ? ". " : "") + geoHint;
  }

  if (!db) {
    if (listEl) listEl.innerHTML = '<p class="results-error">Configure <code>firebase-config.js</code> e recarregue.</p>';
    return;
  }

  const { data: rows, error } = await db
    .from("providers")
    .select("id, full_name, phone, city, state, lat, lng, avatar_url, provider_service_areas(service_areas(slug,name))");

  if (error) {
    if (listEl) listEl.innerHTML = '<p class="results-error">Nao foi possivel carregar profissionais.</p>';
    return;
  }

  const wanted = new Set(slugs);

  const list = (rows || [])
    .filter(row => providerSlugs(row).some(s => wanted.has(s)))
    .map(row => {
      let distanceKm = null;
      if (hasCoords && row.lat != null && row.lng != null) {
        distanceKm = haversineKm(search.clientLat, search.clientLng, row.lat, row.lng);
      }
      return { row, distanceKm };
    })
    .sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return (a.row.full_name || "").localeCompare(b.row.full_name || "", "pt-BR");
    });

  if (list.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    if (listEl) listEl.innerHTML = "";
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  if (!listEl) return;
  listEl.innerHTML = "";

  list.forEach(({ row, distanceKm }) => {
    const card = document.createElement("article");
    card.className = "provider-card";

    if (row.avatar_url) {
      const img = document.createElement("img");
      img.src = row.avatar_url;
      img.alt = "Foto de " + (row.full_name || "prestador");
      img.className = "provider-avatar";
      card.appendChild(img);
    }

    const h = document.createElement("h3");
    h.textContent = row.full_name || "Profissional";
    card.appendChild(h);

    const areas = document.createElement("p");
    areas.className = "provider-areas";
    areas.textContent = formatAreas(row);
    card.appendChild(areas);

    const meta = document.createElement("p");
    meta.className = "provider-meta";
    const loc = [row.city, row.state].filter(Boolean).join(" / ");
    let distText = "";
    if (distanceKm != null) {
      const km = distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm);
      distText = ` · ${km} km de voce`;
    }
    meta.textContent = (loc || "Local nao informado") + distText;
    card.appendChild(meta);

    listEl.appendChild(card);
  });
}

run().catch((err) => {
  console.error("resultados:", err);
  if (listEl) {
    listEl.innerHTML = '<p class="results-error">Erro ao carregar a pagina. <a href="../index.html">Faca uma nova busca</a>.</p>';
  }
});

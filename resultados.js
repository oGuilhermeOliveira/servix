import { supabase } from "./supabase-init.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
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
function closeThemeMenu() { if (themeMenu) themeMenu.hidden = true; if (themeFabButton) themeFabButton.setAttribute("aria-expanded","false"); }

if (themeSwitcher && themeFabButton && themeMenu) {
  let cur = localStorage.getItem(THEME_KEY) || "system";
  if (!["light","dark","system"].includes(cur)) cur = "system";
  applyTheme(cur); updateThemeSelection(cur);
  themeFabButton.addEventListener("click", () => { const o = !themeMenu.hidden; themeMenu.hidden = o; themeFabButton.setAttribute("aria-expanded", o ? "false" : "true"); });
  themeMenuItems.forEach(i => i.addEventListener("click", () => { cur = i.dataset.themeMode; localStorage.setItem(THEME_KEY, cur); applyTheme(cur); updateThemeSelection(cur); closeThemeMenu(); }));
  document.addEventListener("click", e => { if (!themeSwitcher.contains(e.target)) closeThemeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeThemeMenu(); });
  mediaQuery.addEventListener("change", () => { if (cur === "system") applyTheme("system"); });
}

// --- Resultados ---
const titleEl    = document.getElementById("results-title");
const subtitleEl = document.getElementById("results-subtitle");
const listEl     = document.getElementById("results-list");
const emptyEl    = document.getElementById("results-empty");

async function run() {
  const search = readSearchSession();
  if (!search || !search.areaSlugs || search.areaSlugs.length === 0) {
    window.location.replace("index.html");
    return;
  }

  if (titleEl) titleEl.textContent = "Profissionais em " + (search.category || "sua categoria");

  const hasCoords = search.clientLat != null && search.clientLng != null;

  if (subtitleEl) {
    const cepFmt = search.cep ? ` (CEP ${search.cep.slice(0,5)}-${search.cep.slice(5)})` : "";
    const locText = search.city ? `Região: ${search.city}${cepFmt}.` : "";
    const geoHint = hasCoords
      ? " Ordenados pela distância até você."
      : " Informe um CEP válido para ordenar por distância.";
    subtitleEl.textContent = locText + geoHint;
  }

  if (!supabase) {
    if (listEl) listEl.innerHTML = '<p class="results-error">Configure <code>supabase-config.js</code> e recarregue.</p>';
    return;
  }

  const { data: rows, error } = await supabase
    .from("providers")
    .select("id, full_name, phone, city, state, lat, lng, avatar_url, provider_service_areas(service_areas(slug,name))");

  if (error) {
    if (listEl) listEl.innerHTML = '<p class="results-error">Não foi possível carregar profissionais.</p>';
    return;
  }

  const wanted = new Set(search.areaSlugs);

  let list = (rows || [])
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
    if (listEl)  listEl.innerHTML = "";
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
      img.src = row.avatar_url; img.alt = "Foto de " + (row.full_name || "prestador");
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
      distText = ` · 📍 ${km} km de você`;
    } else if (hasCoords) {
      distText = " · distância indisponível";
    }
    meta.textContent = (loc || "Local não informado") + distText;
    card.appendChild(meta);

    if (row.phone) {
      const tel = document.createElement("a");
      tel.className = "btn btn-small provider-tel";
      tel.href = "tel:" + row.phone.replace(/\D/g, "");
      tel.textContent = "Ligar";
      card.appendChild(tel);
    }

    listEl.appendChild(card);
  });
}

run();
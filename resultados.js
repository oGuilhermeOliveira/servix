import { supabase } from "./supabase-init.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = function (d) { return (d * Math.PI) / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function providerSlugs(row) {
  const links = row.provider_service_areas || [];
  return links.map(l => l.service_areas?.slug).filter(Boolean);
}

function formatAreas(row) {
  const links = row.provider_service_areas || [];
  const names = links.map(l => l.service_areas?.name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function readSearchSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_SEARCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
  const saved = localStorage.getItem(THEME_KEY);
  if (["light", "dark", "system"].includes(saved)) return saved;
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

// --- Resultados ---
const titleEl = document.getElementById("results-title");
const subtitleEl = document.getElementById("results-subtitle");
const listEl = document.getElementById("results-list");
const emptyEl = document.getElementById("results-empty");

async function run() {
  const search = readSearchSession();

  if (!search || !search.areaSlugs || search.areaSlugs.length === 0) {
    window.location.replace("index.html");
    return;
  }

  if (titleEl) titleEl.textContent = "Profissionais em " + (search.category || "sua categoria");

  const hasCoords = search.clientLat != null && search.clientLng != null;

  if (subtitleEl) {
    const locText = search.city ? `Região: ${search.city}${search.cep ? ` (CEP ${search.cep})` : ""}.` : "";
    const geoHint = hasCoords
      ? " Ordenados pela distância até você."
      : " Informe um CEP válido na busca para ordenar por distância.";
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
    console.error(error);
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
    });

  list.sort(function (a, b) {
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
  list.forEach(function (item) {
    const row = item.row;
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
    if (item.distanceKm != null) {
      const km = item.distanceKm < 10
        ? item.distanceKm.toFixed(1)
        : Math.round(item.distanceKm);
      distText = ` · ${km} km de você`;
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

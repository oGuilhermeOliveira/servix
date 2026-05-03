import { supabase } from "./supabase-init.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = function (d) {
    return (d * Math.PI) / 180;
  };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeCity(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function providerSlugs(row) {
  const links = row.provider_service_areas || [];
  const out = [];
  links.forEach(function (link) {
    const a = link.service_areas;
    if (a && a.slug) out.push(a.slug);
  });
  return out;
}

function formatAreas(row) {
  const links = row.provider_service_areas || [];
  const names = [];
  links.forEach(function (link) {
    const a = link.service_areas;
    if (a && a.name) names.push(a.name);
  });
  return names.length ? names.join(", ") : "—";
}

function readSearchSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_SEARCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const titleEl = document.getElementById("results-title");
const subtitleEl = document.getElementById("results-subtitle");
const listEl = document.getElementById("results-list");
const emptyEl = document.getElementById("results-empty");
const themeSwitcher = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu = document.getElementById("theme-menu");
const themeMenuItems = document.querySelectorAll(".theme-menu-item");
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

async function run() {
  const search = readSearchSession();

  if (!search || !search.areaSlugs || search.areaSlugs.length === 0) {
    window.location.replace("index.html");
    return;
  }

  if (titleEl) titleEl.textContent = "Profissionais em " + (search.category || "sua categoria");
  if (subtitleEl) {
    const geoHint =
      search.clientLat != null && search.clientLng != null
        ? " Ordenados pela sua localização (quando o profissional informou coordenadas)."
        : " Ative a localização no próximo pedido para ordenar por distância.";
    subtitleEl.textContent = (search.city ? "Região informada: " + search.city + "." : "") + geoHint;
  }

  if (!supabase) {
    if (listEl) {
      listEl.innerHTML =
        '<p class="results-error">Configure <code>supabase-config.js</code> e recarregue a página.</p>';
    }
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
  const cityNorm = normalizeCity(search.city);
  let list = (rows || []).filter(function (row) {
    const slugs = providerSlugs(row);
    return slugs.some(function (s) {
      return wanted.has(s);
    });
  });

  const hasClient = search.clientLat != null && search.clientLng != null;

  list = list.map(function (row) {
    let distanceKm = null;
    if (hasClient && row.lat != null && row.lng != null) {
      distanceKm = haversineKm(search.clientLat, search.clientLng, row.lat, row.lng);
    }
    let cityScore = 0;
    if (cityNorm && row.city) {
      const pCity = normalizeCity(row.city);
      if (pCity && cityNorm.includes(pCity)) cityScore = 2;
      else if (pCity && pCity.includes(cityNorm.split(",")[0].trim())) cityScore = 1;
    }
    return { row: row, distanceKm: distanceKm, cityScore: cityScore };
  });

  list.sort(function (a, b) {
    const da = a.distanceKm;
    const db = b.distanceKm;
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    if (b.cityScore !== a.cityScore) return b.cityScore - a.cityScore;
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
      distText = " · aprox. " + (item.distanceKm < 10 ? item.distanceKm.toFixed(1) : Math.round(item.distanceKm)) + " km";
    } else if (hasClient) {
      distText = " · distância indisponível (profissional sem localização no cadastro)";
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

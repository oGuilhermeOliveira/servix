import { db } from "./firebase-init.js";
import {
  averageRating,
  fetchProviderReviewStats,
  formatRatingValue,
  renderStarRating,
} from "./provider-reviews.js";

const SESSION_SEARCH_KEY = "servix:last-search";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function providerSlugs(row) {
  return (row.provider_service_areas || []).map((l) => l.service_areas?.slug).filter(Boolean);
}

function formatAreas(row) {
  const names = (row.provider_service_areas || []).map((l) => l.service_areas?.name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function formatPhoneDisplay(raw) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || "—";
}

function readSearchSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_SEARCH_KEY));
  } catch {
    return null;
  }
}

function writeSearchSession(data) {
  try {
    sessionStorage.setItem(SESSION_SEARCH_KEY, JSON.stringify(data));
  } catch {
    /* */
  }
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

// --- Modal prestador ---
const providerModal = document.getElementById("provider-modal");
const providerModalBody = document.getElementById("provider-modal-body");

function closeProviderModal() {
  if (!providerModal) return;
  providerModal.hidden = true;
  providerModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openProviderModal(row, stats) {
  if (!providerModal || !providerModalBody) return;

  const avg = averageRating(stats);
  const count = stats?.count || 0;
  const name = row.full_name || "Profissional";
  const phone = formatPhoneDisplay(row.phone);

  providerModalBody.replaceChildren();

  const title = document.createElement("h2");
  title.id = "provider-modal-title";
  title.textContent = name;
  providerModalBody.appendChild(title);

  const ratingRow = document.createElement("p");
  ratingRow.className = "provider-modal-rating";
  if (avg != null) {
    ratingRow.appendChild(renderStarRating(avg, { large: true }));
    const meta = document.createElement("span");
    meta.className = "provider-modal-rating-meta";
    meta.textContent = ` · ${formatRatingValue(avg)} de 5 (${count} avaliação${count === 1 ? "" : "ões"})`;
    ratingRow.appendChild(meta);
  } else {
    ratingRow.textContent = "Ainda sem avaliações";
  }
  providerModalBody.appendChild(ratingRow);

  const phoneP = document.createElement("p");
  phoneP.className = "provider-modal-phone";
  phoneP.innerHTML = `<strong>Telefone:</strong> ${phone}`;
  providerModalBody.appendChild(phoneP);

  const areasP = document.createElement("p");
  areasP.className = "provider-modal-areas";
  areasP.textContent = formatAreas(row);
  providerModalBody.appendChild(areasP);

  const recent = (stats?.reviews || [])
    .filter((r) => r.comment && String(r.comment).trim())
    .slice(0, 3);

  if (recent.length) {
    const h = document.createElement("h3");
    h.className = "provider-modal-comments-title";
    h.textContent = "Comentários recentes";
    providerModalBody.appendChild(h);
    const list = document.createElement("ul");
    list.className = "provider-modal-comments";
    recent.forEach(function (r) {
      const li = document.createElement("li");
      const stars = renderStarRating(r.rating, { showValue: false });
      const text = document.createElement("p");
      text.textContent = `"${String(r.comment).trim()}" — ${(r.client_name || "Cliente").trim()}`;
      li.appendChild(stars);
      li.appendChild(text);
      list.appendChild(li);
    });
    providerModalBody.appendChild(list);
  }

  providerModal.hidden = false;
  providerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

providerModal?.querySelectorAll("[data-close-modal]").forEach(function (el) {
  el.addEventListener("click", closeProviderModal);
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeProviderModal();
});

// --- Tema ---
const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeSwitcher = document.getElementById("theme-switcher");
const themeFabButton = document.getElementById("theme-fab-button");
const themeMenu = document.getElementById("theme-menu");
const themeMenuItems = document.querySelectorAll(".theme-menu-item");

function getResolvedTheme(m) {
  return m === "system" ? (mediaQuery.matches ? "dark" : "light") : m;
}
function applyTheme(m) {
  document.documentElement.setAttribute("data-theme", getResolvedTheme(m));
}
function updateThemeSelection(m) {
  themeMenuItems.forEach((i) => {
    const a = i.dataset.themeMode === m;
    i.classList.toggle("active", a);
    i.setAttribute("aria-pressed", a ? "true" : "false");
  });
}
function closeThemeMenu() {
  if (themeMenu) themeMenu.hidden = true;
  if (themeFabButton) themeFabButton.setAttribute("aria-expanded", "false");
}

if (themeSwitcher && themeFabButton && themeMenu) {
  let cur = localStorage.getItem(THEME_KEY) || "system";
  if (!["light", "dark", "system"].includes(cur)) cur = "system";
  applyTheme(cur);
  updateThemeSelection(cur);
  themeFabButton.addEventListener("click", () => {
    const o = !themeMenu.hidden;
    themeMenu.hidden = o;
    themeFabButton.setAttribute("aria-expanded", o ? "false" : "true");
  });
  themeMenuItems.forEach((i) =>
    i.addEventListener("click", () => {
      cur = i.dataset.themeMode;
      localStorage.setItem(THEME_KEY, cur);
      applyTheme(cur);
      updateThemeSelection(cur);
      closeThemeMenu();
    })
  );
  document.addEventListener("click", (e) => {
    if (!themeSwitcher.contains(e.target)) closeThemeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeThemeMenu();
  });
  mediaQuery.addEventListener("change", () => {
    if (cur === "system") applyTheme("system");
  });
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
      ? "Ordenados pela distancia ate voce. Clique no card para ver telefone e avaliacoes."
      : "Clique no card para ver telefone e avaliacoes.";
    subtitleEl.textContent = locText + groupLabel.trim() + (groupLabel ? ". " : "") + geoHint;
  }

  if (!db) {
    if (listEl) {
      listEl.innerHTML =
        '<p class="results-error">Configure <code>firebase-config.js</code> e recarregue.</p>';
    }
    return;
  }

  const reviewStatsMap = await fetchProviderReviewStats(db);

  const { data: rows, error } = await db
    .from("providers")
    .select(
      "id, full_name, phone, city, state, lat, lng, avatar_url, provider_service_areas(service_areas(slug,name))"
    );

  if (error) {
    if (listEl) listEl.innerHTML = '<p class="results-error">Nao foi possivel carregar profissionais.</p>';
    return;
  }

  const wanted = new Set(slugs);

  const list = (rows || [])
    .filter((row) => providerSlugs(row).some((s) => wanted.has(s)))
    .map((row) => {
      let distanceKm = null;
      if (hasCoords && row.lat != null && row.lng != null) {
        distanceKm = haversineKm(search.clientLat, search.clientLng, row.lat, row.lng);
      }
      const stats = reviewStatsMap.get(row.id) || null;
      return { row, distanceKm, stats };
    })
    .sort((a, b) => {
      const avgA = averageRating(a.stats);
      const avgB = averageRating(b.stats);
      if (avgA != null && avgB != null && avgB !== avgA) return avgB - avgA;
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

  list.forEach(({ row, distanceKm, stats }) => {
    const card = document.createElement("article");
    card.className = "provider-card provider-card-clickable";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute(
      "aria-label",
      "Ver detalhes de " + (row.full_name || "profissional")
    );

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

    const avg = averageRating(stats);
    const ratingLine = document.createElement("p");
    ratingLine.className = "provider-rating-line";
    if (avg != null) {
      ratingLine.appendChild(renderStarRating(avg));
      const count = stats?.count || 0;
      const countSpan = document.createElement("span");
      countSpan.className = "provider-rating-count";
      countSpan.textContent = ` (${count})`;
      ratingLine.appendChild(countSpan);
    } else {
      ratingLine.textContent = "Sem avaliações ainda";
      ratingLine.classList.add("provider-rating-empty");
    }
    card.appendChild(ratingLine);

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

    const hint = document.createElement("p");
    hint.className = "provider-card-hint";
    hint.textContent = "Clique para ver telefone e detalhes";
    card.appendChild(hint);

    function open() {
      openProviderModal(row, stats);
    }
    card.addEventListener("click", open);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    listEl.appendChild(card);
  });
}

run().catch((err) => {
  console.error("resultados:", err);
  if (listEl) {
    listEl.innerHTML =
      '<p class="results-error">Erro ao carregar a pagina. <a href="../index.html">Faca uma nova busca</a>.</p>';
  }
});

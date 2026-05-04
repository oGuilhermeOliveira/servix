import { supabase } from "./supabase-init.js";

// --- Tema ---
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
  document.querySelectorAll(".theme-menu-item").forEach(function (item) {
    const active = item.dataset.themeMode === mode;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", active ? "true" : "false");
  });
}
(function setupTheme() {
  const switcher = document.getElementById("theme-switcher");
  const button = document.getElementById("theme-fab-button");
  const menu = document.getElementById("theme-menu");
  if (!switcher || !button || !menu) return;
  let current = localStorage.getItem(THEME_KEY) || "system";
  if (!["light", "dark", "system"].includes(current)) current = "system";
  applyTheme(current);
  updateThemeSelection(current);
  button.addEventListener("click", function () {
    const open = !menu.hidden;
    menu.hidden = open;
    button.setAttribute("aria-expanded", open ? "false" : "true");
  });
  document.querySelectorAll(".theme-menu-item").forEach(function (item) {
    item.addEventListener("click", function () {
      const next = item.dataset.themeMode;
      if (!next) return;
      current = next;
      localStorage.setItem(THEME_KEY, current);
      applyTheme(current);
      updateThemeSelection(current);
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  });
  document.addEventListener("click", function (e) {
    if (!switcher.contains(e.target)) {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  mediaQuery.addEventListener("change", function () {
    if (current === "system") applyTheme("system");
  });
})();

// --- Helpers ---
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

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// --- Elementos ---
const elLoading = document.getElementById("dashboard-loading");
const elNotLogged = document.getElementById("not-logged");
const elMain = document.getElementById("dashboard-main");
const elName = document.getElementById("profile-name");
const elEmail = document.getElementById("profile-email");
const elPhone = document.getElementById("profile-phone");
const elLocation = document.getElementById("profile-location");
const elAvatarContainer = document.getElementById("profile-avatar-container");
const elAreasTags = document.getElementById("profile-areas-tags");
const elRequestsList = document.getElementById("requests-list");
const elRequestsCount = document.getElementById("requests-count");
const elLogout = document.getElementById("dashboard-logout");

function showState(state) {
  elLoading.hidden = state !== "loading";
  elNotLogged.hidden = state !== "not-logged";
  elMain.hidden = state !== "main";
}

function renderProfile(provider, areas) {
  elName.textContent = provider.full_name || "Sem nome";
  elEmail.textContent = provider.email || "—";
  elPhone.textContent = provider.phone || "—";
  elLocation.textContent = [provider.city, provider.state].filter(Boolean).join(" / ") || "Não informado";

  if (provider.avatar_url) {
    const img = document.createElement("img");
    img.src = provider.avatar_url;
    img.alt = "Foto de " + (provider.full_name || "prestador");
    img.className = "profile-avatar-large";
    elAvatarContainer.replaceChildren(img);
  }

  elAreasTags.innerHTML = "";
  areas.forEach(function (area) {
    const tag = document.createElement("span");
    tag.className = "area-tag";
    tag.textContent = area.name;
    elAreasTags.appendChild(tag);
  });
}

// Para cada categoria hero, quais slugs ela representa
const CATEGORY_SLUG_MAP = {
  "Reformas e Reparos": ["encanador", "pintor", "eletricista", "pedreiro", "marceneiro", "jardineiro", "ar_condicionado"],
  "Servicos Domesticos": ["diarista"],
  "Design e Tecnologia": ["design", "informatica", "fotografo"],
  "Saude e Bem-estar": ["bem_estar"],
};

// Retorna true se qualquer slug do prestador está coberto pela categoria do pedido
function requestMatchesProvider(requestCategory, providerSlugs) {
  const slugSet = new Set(providerSlugs);
  // Slugs que a categoria do pedido representa
  const categorySlugs = CATEGORY_SLUG_MAP[requestCategory] || [];
  // Basta um slug em comum
  return categorySlugs.some(s => slugSet.has(s));
}

function renderRequests(requests, provider, providerSlugs) {
  elRequestsList.innerHTML = "";

  // Filtra apenas os pedidos que batem com as áreas do prestador
  const matching = requests.filter(r => requestMatchesProvider(r.category, providerSlugs));

  if (matching.length === 0) {
    elRequestsList.innerHTML = `
      <div class="requests-empty">
        <p>Nenhum pedido encontrado para suas áreas ainda.</p>
        <p style="margin-top:0.5rem;font-size:0.85rem">Quando clientes buscarem profissionais da sua área, os pedidos aparecem aqui.</p>
      </div>`;
    return;
  }

  elRequestsCount.textContent = matching.length;
  elRequestsCount.hidden = false;

  matching.forEach(function (req) {
    const card = document.createElement("div");
    card.className = "request-card";

    // Distância
    let distHtml = "";
    if (provider.lat != null && provider.lng != null && req.client_lat != null && req.client_lng != null) {
      const km = haversineKm(provider.lat, provider.lng, req.client_lat, req.client_lng);
      const kmStr = km < 10 ? km.toFixed(1) : Math.round(km);
      distHtml = `<span class="request-dist">📍 ${kmStr} km de você</span>`;
    }

    card.innerHTML = `
      <div class="request-card-top">
        <span class="request-category">${req.category || "—"}</span>
        <span class="request-date">${formatDate(req.created_at)}</span>
      </div>
      <div class="request-location">
        <span>🏙</span>
        <span>${req.city || "Cidade não informada"}</span>
        ${distHtml}
      </div>
      ${req.client_name ? `<div class="request-location"><span>👤</span><span>${req.client_name}</span></div>` : ""}
      ${req.client_phone
        ? `<a class="btn btn-small provider-tel" href="tel:${req.client_phone.replace(/\D/g, "")}" style="margin-top:0.6rem;display:inline-block">📞 ${req.client_phone}</a>`
        : ""
      }`;

    elRequestsList.appendChild(card);
  });
}

// --- Logout ---
elLogout.addEventListener("click", async function () {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "prestador.html";
});

// --- Init ---
async function init() {
  if (!supabase) {
    showState("not-logged");
    return;
  }

  showState("loading");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showState("not-logged");
    return;
  }

  // Buscar dados do prestador com áreas
  const { data: provider, error: provError } = await supabase
    .from("providers")
    .select("id, full_name, email, phone, city, state, avatar_url, lat, lng, provider_service_areas(service_areas(id, slug, name))")
    .eq("auth_user_id", user.id)
    .single();

  if (provError || !provider) {
    showState("not-logged");
    return;
  }

  const areas = (provider.provider_service_areas || [])
    .map(l => l.service_areas)
    .filter(Boolean);

  const providerSlugs = areas.map(a => a.slug);

  renderProfile(provider, areas);

  // Buscar todas as requisições de serviço
  const { data: requests, error: reqError } = await supabase
    .from("service_requests")
    .select("id, category, city, client_lat, client_lng, client_name, client_phone, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (reqError) {
    elRequestsList.innerHTML = '<p class="results-error">Não foi possível carregar os pedidos.</p>';
  } else {
    renderRequests(requests || [], provider, providerSlugs);
  }

  showState("main");
}

init();
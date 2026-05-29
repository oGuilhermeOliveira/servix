import { db } from "./firebase-init.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";
import { notifyManyRequestsIfNeeded, notifyProfileUpdated } from "./notifications.js";
import { ensureProviderRow, loadProviderAreas } from "./provider-areas.js";

injectFooter();
setupThemeSwitcher();

const CATEGORY_SLUG_MAP = {
  "Reformas e Reparos": [
    "encanador", "pintor", "eletricista", "pedreiro", "marceneiro", "jardineiro",
    "ar_condicionado", "desentupidor", "marido_aluguel", "vidraceiro", "gesso_drywall",
    "serralheria", "redes_protecao", "tapeceiro", "dedetizador", "seguranca_eletronica",
    "eletrodomesticos", "chaveiro", "limpeza_pos_obra", "impermeabilizacao", "arquiteto",
  ],
  "Servicos Domesticos": ["diarista", "passadeira", "cozinheira", "baba", "cuidador"],
  "Servicos Domesticos e Lar": ["diarista", "passadeira", "cozinheira", "baba", "cuidador", "informatica", "redes_cabeamento", "bem_estar", "manicure", "cabeleireiro"],
  "Manutencao do Lar": ["informatica", "redes_cabeamento", "bem_estar", "manicure", "cabeleireiro"],
};

let chartInstance = null;
let state = {
  provider: null,
  areas: [],
  providerSlugs: [],
  allRequests: [],
  dismissedIds: new Set(),
  filterSlug: "",
  chartData: { labels: [], requests: [], completed: [] },
};

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
const elFilterArea = document.getElementById("filter-area");
const elCompletedBody = document.getElementById("completed-table-body");
const elExportChart = document.getElementById("export-chart-btn");

function showState(s) {
  elLoading.hidden = s !== "loading";
  elNotLogged.hidden = s !== "not-logged";
  elMain.hidden = s !== "main";
}

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

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getServiceLabel(req) {
  return state.areas.find((a) => a.slug === req.area_slug)?.name || req.category || "serviço";
}

function normalizeWhatsAppPhone(raw) {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.startsWith("0")) return "55" + digits.replace(/^0+/, "");
  return digits;
}

function buildRatingWhatsAppMessage(req) {
  const clientName = (req.client_name || "cliente").trim();
  const providerName = (state.provider?.full_name || "seu prestador").trim();
  const service = getServiceLabel(req);
  return (
    `Olá, ${clientName}! Aqui é ${providerName}, da Servix Solutions.\n\n` +
    `O serviço de *${service}* foi concluído. Como você avalia o atendimento?\n\n` +
    `*Responda com um número de 0 a 5:*\n\n` +
    `0 - Péssimo\n1 - Ruim\n2 - Regular\n3 - Bom\n4 - Muito bom\n5 - Excelente\n\n` +
    `Obrigado pela preferência!`
  );
}

function openRatingWhatsApp(req) {
  const phone = normalizeWhatsAppPhone(req.client_phone);
  if (!phone || phone.length < 12) {
    alert("Serviço concluído, mas o telefone do cliente é inválido para abrir o WhatsApp.");
    return;
  }
  const url =
    "https://wa.me/" + phone + "?text=" + encodeURIComponent(buildRatingWhatsAppMessage(req));
  window.open(url, "_blank", "noopener,noreferrer");
}

function requestMatchesProvider(request, providerSlugs) {
  const slugSet = new Set(providerSlugs);
  if (request.area_slug) return slugSet.has(request.area_slug);
  const categorySlugs = CATEGORY_SLUG_MAP[request.category] || [];
  return categorySlugs.some((s) => slugSet.has(s));
}

function getMatchingRequests() {
  return state.allRequests.filter((r) => {
    if (state.dismissedIds.has(r.id)) return false;
    if (!requestMatchesProvider(r, state.providerSlugs)) return false;
    if (state.filterSlug) {
      const matchesArea = r.area_slug === state.filterSlug;
      const matchesCategory = (CATEGORY_SLUG_MAP[r.category] || []).includes(state.filterSlug);
      if (!matchesArea && !matchesCategory) return false;
    }
    return true;
  });
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
  areas.forEach((area) => {
    const tag = document.createElement("span");
    tag.className = "area-tag";
    tag.textContent = area.name;
    elAreasTags.appendChild(tag);
  });
}

function populateAreaFilter(areas) {
  if (!elFilterArea) return;
  elFilterArea.innerHTML = '<option value="">Todas as áreas</option>';
  areas.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.slug;
    opt.textContent = a.name;
    elFilterArea.appendChild(opt);
  });
}

async function dismissRequest(requestId) {
  const { error } = await db.from("provider_dismissed_requests").insert({
    id: `${state.provider.id}__${requestId}`,
    provider_id: state.provider.id,
    request_id: requestId,
  });
  if (error) {
    alert("Não foi possível ocultar o pedido. Verifique as regras do Firestore (coleção provider_dismissed_requests).");
    return;
  }
  state.dismissedIds.add(requestId);
  renderRequests();
  updateChart();
}

async function completeRequest(req) {
  if (!req.client_phone?.replace(/\D/g, "")) {
    alert("Este pedido não tem telefone do cliente. Não é possível enviar a avaliação pelo WhatsApp.");
    return;
  }

  const ok = confirm(
    "Marcar como concluído e abrir o WhatsApp com mensagem pedindo avaliação (0 a 5)?"
  );
  if (!ok) return;

  const row = {
    id: `${state.provider.id}__${req.id}`,
    provider_id: state.provider.id,
    request_id: req.id,
    category: req.category || "Serviço",
    area_slug: req.area_slug,
    city: req.city,
    client_name: req.client_name,
    client_phone: req.client_phone,
  };
  const { error } = await db.from("completed_services").insert(row);
  if (error) {
    alert("Erro ao registrar serviço concluído: " + error.message);
    return;
  }
  if (!state.dismissedIds.has(req.id)) {
    await db.from("provider_dismissed_requests").insert({
      id: `${state.provider.id}__${req.id}`,
      provider_id: state.provider.id,
      request_id: req.id,
    });
    state.dismissedIds.add(req.id);
  }
  renderRequests();
  await loadCompletedServices();
  updateChart();

  openRatingWhatsApp(req);
}

function renderRequests() {
  elRequestsList.innerHTML = "";
  const matching = getMatchingRequests();
  const providerName = state.provider?.full_name || "prestador";

  if (matching.length === 0) {
    elRequestsList.innerHTML = `
      <div class="requests-empty">
        <p>Nenhum pedido encontrado para o filtro selecionado.</p>
      </div>`;
    elRequestsCount.hidden = true;
    return;
  }

  elRequestsCount.textContent = matching.length;
  elRequestsCount.hidden = false;

  matching.forEach((req) => {
    const card = document.createElement("div");
    card.className = "request-card";
    const clientPhoneDigits = (req.client_phone || "").replace(/\D/g, "");
    const whatsappMessage = encodeURIComponent(
      `Olá, meu nome é ${providerName}, recebi seu pedido. Vamos conversar!`
    );
    const whatsappUrl = `https://wa.me/${clientPhoneDigits}?text=${whatsappMessage}`;

    let distHtml = "";
    if (
      state.provider.lat != null && state.provider.lng != null &&
      req.client_lat != null && req.client_lng != null
    ) {
      const km = haversineKm(state.provider.lat, state.provider.lng, req.client_lat, req.client_lng);
      const kmStr = km < 10 ? km.toFixed(1) : Math.round(km);
      distHtml = `<span class="request-dist">📍 ${kmStr} km de você</span>`;
    }

    const areaLabel = state.areas.find((a) => a.slug === req.area_slug)?.name || req.category;

    card.innerHTML = `
      <div class="request-card-top">
        <span class="request-category">${areaLabel || "—"}</span>
        <span class="request-date">${formatDate(req.created_at)}</span>
      </div>
      <div class="request-location">
        <span>🏙</span><span>${req.city || "Cidade não informada"}</span>${distHtml}
      </div>
      ${req.client_name ? `<div class="request-location"><span>👤</span><span>${req.client_name}</span></div>` : ""}
      <div class="request-actions">
        ${req.client_phone
          ? `<a class="btn btn-small" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">📞 WhatsApp</a>`
          : ""}
        <button type="button" class="btn btn-small btn-ghost" data-complete="${req.id}">Marcar concluído</button>
        <button type="button" class="btn btn-small btn-ghost" data-dismiss="${req.id}">Excluir pedido</button>
      </div>`;

    card.querySelector("[data-dismiss]")?.addEventListener("click", () => {
      if (confirm("Ocultar este pedido da sua lista?")) dismissRequest(req.id);
    });
    card.querySelector("[data-complete]")?.addEventListener("click", () => completeRequest(req));

    elRequestsList.appendChild(card);
  });
}

function sortByCompletedAt(rows) {
  return [...(rows || [])].sort(function (a, b) {
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tb - ta;
  });
}

async function loadCompletedServices() {
  if (!elCompletedBody) return;
  const { data, error } = await db
    .from("completed_services")
    .select("id, category, area_slug, city, client_name, completed_at")
    .eq("provider_id", state.provider.id);

  if (error) {
    elCompletedBody.innerHTML = `<tr><td colspan="4">Não foi possível carregar serviços concluídos: ${error.message}</td></tr>`;
    return;
  }

  const sorted = sortByCompletedAt(data).slice(0, 50);
  state._completedRaw = sorted;

  if (!sorted.length) {
    elCompletedBody.innerHTML = `<tr><td colspan="4">Nenhum serviço concluído registrado.</td></tr>`;
    return;
  }

  elCompletedBody.innerHTML = sorted.map((row) => {
    const areaName = state.areas.find((a) => a.slug === row.area_slug)?.name || row.category;
    return `<tr>
      <td>${areaName}</td>
      <td>${row.city || "—"}</td>
      <td>${row.client_name || "—"}</td>
      <td>${formatDate(row.completed_at)}</td>
    </tr>`;
  }).join("");
}

function buildChartData(requests, completed) {
  const months = {};
  const add = (iso, field) => {
    if (!iso) return;
    const key = iso.slice(0, 7);
    if (!months[key]) months[key] = { requests: 0, completed: 0 };
    months[key][field]++;
  };

  requests.forEach((r) => {
    if (requestMatchesProvider(r, state.providerSlugs)) add(r.created_at, "requests");
  });
  (completed || []).forEach((c) => add(c.completed_at, "completed"));

  const keys = Object.keys(months).sort();
  return {
    labels: keys.map((k) => {
      const [y, m] = k.split("-");
      return `${m}/${y}`;
    }),
    requests: keys.map((k) => months[k].requests),
    completed: keys.map((k) => months[k].completed),
  };
}

function updateChart() {
  const canvas = document.getElementById("stats-chart");
  if (!canvas || typeof Chart === "undefined") return;

  state.chartData = buildChartData(state.allRequests, state._completedRaw || []);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: state.chartData.labels.length ? state.chartData.labels : ["Sem dados"],
      datasets: [
        {
          label: "Orçamentos solicitados",
          data: state.chartData.requests.length ? state.chartData.requests : [0],
          backgroundColor: "rgba(255, 193, 7, 0.7)",
        },
        {
          label: "Serviços concluídos",
          data: state.chartData.completed.length ? state.chartData.completed : [0],
          backgroundColor: "rgba(40, 167, 69, 0.7)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function exportChartCsv() {
  const { labels, requests, completed } = state.chartData;
  if (!labels.length) {
    alert("Não há dados para exportar.");
    return;
  }
  const lines = ["Mes;Orcamentos_solicitados;Servicos_concluidos"];
  labels.forEach((label, i) => {
    lines.push(`${label};${requests[i] || 0};${completed[i] || 0}`);
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `servix-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

elExportChart?.addEventListener("click", exportChartCsv);

elFilterArea?.addEventListener("change", () => {
  state.filterSlug = elFilterArea.value;
  renderRequests();
});

elLogout?.addEventListener("click", async () => {
  if (!db) return;
  await db.auth.signOut();
  window.location.href = "prestador.html";
});

function showToast(msg) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;top:90px;left:50%;transform:translateX(-50%);
    background:var(--primary);color:#fff;padding:0.75rem 1.4rem;
    border-radius:10px;font-weight:700;z-index:999;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

if (new URLSearchParams(window.location.search).get("perfil") === "atualizado") {
  window.history.replaceState({}, "", window.location.pathname);
  document.addEventListener("DOMContentLoaded", async () => {
    showToast("✅ Perfil atualizado com sucesso!");
  }, { once: true });
}

async function init() {
  if (!db) {
    showState("not-logged");
    return;
  }
  showState("loading");

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    showState("not-logged");
    return;
  }

  try {
    await ensureProviderRow(db, user, user.email || "");
  } catch (error) {
    console.error("ensureProviderRow", error);
  }

  const { data: provider, error: provError } = await db
    .from("providers")
    .select("id, full_name, email, phone, city, state, avatar_url, lat, lng, provider_service_areas(service_areas(id, slug, name))")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (provError || !provider) {
    showState("not-logged");
    const notLoggedEl = document.getElementById("not-logged");
    if (notLoggedEl) {
      notLoggedEl.querySelector("p").textContent =
        "Não foi possível carregar seu perfil de prestador. Conclua o cadastro ou tente novamente.";
      const link = notLoggedEl.querySelector("a");
      if (link) {
        link.textContent = "Completar cadastro";
        link.href = "prestador.html";
      }
    }
    return;
  }

  state.provider = provider;
  state.areas = await loadProviderAreas(db, provider.id);
  if (!state.areas.length) {
    const nested = (provider.provider_service_areas || []).map((l) => l.service_areas).filter(Boolean);
    state.areas = nested;
  }
  state.providerSlugs = state.areas.map((a) => a.slug).filter(Boolean);

  renderProfile(provider, state.areas);
  populateAreaFilter(state.areas);

  const [reqRes, dismissedRes, completedRes] = await Promise.all([
    db.from("service_requests").select("id, category, area_slug, city, client_lat, client_lng, client_name, client_phone, created_at").order("created_at", { ascending: false }).limit(200),
    db.from("provider_dismissed_requests").select("request_id").eq("provider_id", provider.id),
    db
      .from("completed_services")
      .select("id, category, area_slug, city, client_name, completed_at")
      .eq("provider_id", provider.id),
  ]);

  state.allRequests = reqRes.data || [];
  state.dismissedIds = new Set((dismissedRes.data || []).map((d) => d.request_id));
  state._completedRaw = sortByCompletedAt(completedRes.data || []);

  const matching = getMatchingRequests();
  await notifyManyRequestsIfNeeded(provider.id, matching.length);

  if (new URLSearchParams(window.location.search).get("perfil") === "atualizado") {
    await notifyProfileUpdated(provider.id);
  }

  renderRequests();
  await loadCompletedServices();
  updateChart();
  showState("main");

  if (completedRes.error) {
    console.warn("completed_services:", completedRes.error);
  }
}

init();

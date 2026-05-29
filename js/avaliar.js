import { showAppAlert } from "./app-dialog.js";
import { db } from "./firebase-init.js";
import { areaNameBySlug } from "./provider-areas.js";
import { notifyProviderReview } from "./notifications.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";

injectFooter();
setupThemeSwitcher();
const elLoading = document.getElementById("review-loading");
const elError = document.getElementById("review-error");
const elErrorText = document.getElementById("review-error-text");
const elDone = document.getElementById("review-done");
const elForm = document.getElementById("review-form");
const elIntro = document.getElementById("review-intro");
const elProviderName = document.getElementById("review-provider-name");
const elServiceLabel = document.getElementById("review-service-label");
const elRatingHidden = document.getElementById("review-rating");
const elRatingPick = document.getElementById("rating-pick");
const elComment = document.getElementById("review-comment");

let completedRow = null;
let providerRow = null;
let selectedRating = null;

function showPanel(panel) {
  [elLoading, elError, elDone, elForm].forEach(function (el) {
    if (el) el.hidden = el !== panel;
  });
}

function buildRatingPicker() {
  if (!elRatingPick) return;
  elRatingPick.replaceChildren();
  for (let n = 0; n <= 5; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-pick-btn";
    btn.dataset.value = String(n);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.textContent = String(n);
    btn.addEventListener("click", function () {
      selectedRating = n;
      elRatingHidden.value = String(n);
      elRatingPick.querySelectorAll(".rating-pick-btn").forEach(function (b) {
        const active = b.dataset.value === String(n);
        b.classList.toggle("active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
      });
    });
    elRatingPick.appendChild(btn);
  }
}

async function loadCompleted(refId) {
  const res = await db.from("completed_services").select("*").eq("id", refId).maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) throw new Error("Link de avaliação inválido ou expirado.");
  return res.data;
}

async function loadProvider(providerId) {
  const res = await db
    .from("providers")
    .select("id, full_name, phone, city, state")
    .eq("id", providerId)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data;
}

async function existingReview(refId) {
  const res = await db.from("provider_reviews").select("id").eq("id", refId).maybeSingle();
  if (res.error) throw res.error;
  return res.data;
}

async function init() {
  buildRatingPicker();

  const refId = new URLSearchParams(window.location.search).get("ref")?.trim();
  if (!refId) {
    showPanel(elError);
    if (elErrorText) elErrorText.textContent = "Use o link enviado pelo prestador após a conclusão do serviço.";
    return;
  }

  if (!db) {
    showPanel(elError);
    if (elErrorText) elErrorText.textContent = "Firebase não configurado. Tente novamente mais tarde.";
    return;
  }

  try {
    const already = await existingReview(refId);
    if (already) {
      showPanel(elDone);
      return;
    }

    completedRow = await loadCompleted(refId);
    providerRow = await loadProvider(completedRow.provider_id);

    const clientName = (completedRow.client_name || "Cliente").trim();
    const providerName = (providerRow?.full_name || "Prestador").trim();
    const areaLabel =
      completedRow.area_slug
        ? areaNameBySlug(completedRow.area_slug)
        : completedRow.category || "Serviço";

    if (elIntro) {
      elIntro.textContent = `Olá, ${clientName}! Como foi o atendimento de ${providerName}?`;
    }
    if (elProviderName) elProviderName.textContent = providerName;
    if (elServiceLabel) elServiceLabel.textContent = `Serviço: ${areaLabel}`;

    showPanel(elForm);
  } catch (error) {
    showPanel(elError);
    if (elErrorText) elErrorText.textContent = error.message || "Não foi possível carregar a avaliação.";
  }
}

elForm?.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!db || !completedRow) return;

  const rating = Number(elRatingHidden?.value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    showAppAlert("Selecione uma nota de 0 a 5.", { variant: "error" });
    return;
  }

  const refId = completedRow.id;
  const areaSlug = completedRow.area_slug || null;
  const areaName = areaSlug ? areaNameBySlug(areaSlug) : completedRow.category || "";

  const submitBtn = elForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";
  }

  const payload = {
    id: refId,
    provider_id: completedRow.provider_id,
    request_id: completedRow.request_id || null,
    completed_service_id: refId,
    client_name: (completedRow.client_name || "Cliente").trim(),
    rating: rating,
    comment: (elComment?.value || "").trim(),
    area_slug: areaSlug,
    area_name: areaName,
    category: completedRow.category || null,
    created_at: new Date().toISOString(),
  };

  const { error } = await db.from("provider_reviews").insert(payload);

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar avaliação";
  }

  if (error) {
    showAppAlert("Erro ao enviar: " + (error.message || "tente novamente."), { variant: "error" });
    return;
  }

  try {
    await notifyProviderReview(completedRow.provider_id, payload);
  } catch (err) {
    console.warn("notifyProviderReview:", err);
  }

  showPanel(elDone);
});

init();

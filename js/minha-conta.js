import { showAppAlert } from "./app-dialog.js";
import { db } from "./firebase-init.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";
import { renderStarRating } from "./provider-reviews.js";
import {
  fetchNotifications,
  getProviderPrefs,
  markAllNotificationsRead,
  markNotificationRead,
  updateProviderPrefs,
  getUnreadCount,
  parseReviewNotificationPayload,
  REVIEW_NOTIFICATION_TTL_MS,
} from "./notifications.js";

injectFooter();
setupThemeSwitcher();

const elLoading = document.getElementById("account-loading");
const elGuest = document.getElementById("account-guest");
const elMain = document.getElementById("account-main");
const elNotifList = document.getElementById("notif-list");
const prefMany = document.getElementById("pref-many-requests");
const prefProfile = document.getElementById("pref-profile-changes");
const prefsForm = document.getElementById("prefs-form");
const markAllBtn = document.getElementById("mark-all-read");

let providerId = null;

function show(state) {
  elLoading.hidden = state !== "loading";
  elGuest.hidden = state !== "guest";
  elMain.hidden = state !== "main";
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

function reviewExpiresHint(createdAt) {
  const created = new Date(createdAt).getTime();
  const expires = created + REVIEW_NOTIFICATION_TTL_MS;
  const daysLeft = Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) return "";
  if (daysLeft === 1) return "Some amanhã se não for lida";
  return `Some em ${daysLeft} dias se não for lida`;
}

function renderReviewNotification(div, n, review) {
  div.classList.add("notif-item-review");
  const head = document.createElement("div");
  head.className = "notif-review-head";
  const title = document.createElement("strong");
  title.textContent = n.title || "Nova avaliação";
  head.appendChild(title);
  if (Number.isFinite(review.rating)) {
    head.appendChild(renderStarRating(review.rating, { showValue: true }));
  }
  div.appendChild(head);

  const meta = document.createElement("p");
  meta.className = "notif-review-meta";
  meta.textContent = review.areaName ? `Área: ${review.areaName}` : "";
  if (meta.textContent) div.appendChild(meta);

  if (review.comment) {
    const quote = document.createElement("p");
    quote.className = "notif-review-comment";
    quote.textContent = `"${review.comment}"`;
    div.appendChild(quote);
  } else {
    const noComment = document.createElement("p");
    noComment.className = "notif-review-comment muted";
    noComment.textContent = "Sem comentário.";
    div.appendChild(noComment);
  }

  const foot = document.createElement("div");
  foot.className = "notif-review-foot";
  const time = document.createElement("time");
  time.textContent = formatDate(n.created_at);
  foot.appendChild(time);
  const hint = document.createElement("span");
  hint.className = "notif-review-expires";
  hint.textContent = reviewExpiresHint(n.created_at);
  if (hint.textContent) foot.appendChild(hint);
  div.appendChild(foot);
}

function renderNotifications(items) {
  elNotifList.innerHTML = "";
  if (!items.length) {
    elNotifList.innerHTML =
      '<p class="form-hint">Nenhuma notificação recente. Avaliações de clientes aparecem aqui por até 5 dias.</p>';
    return;
  }
  items.forEach((n) => {
    const div = document.createElement("div");
    div.className = "notif-item" + (n.read_at ? "" : " unread");
    const review = parseReviewNotificationPayload(n);

    if (review) {
      renderReviewNotification(div, n, review);
    } else {
      div.innerHTML = `
        <strong>${n.title}</strong>
        <p style="margin:0.3rem 0 0">${n.message}</p>
        <time>${formatDate(n.created_at)}</time>
      `;
    }

    if (!n.read_at) {
      div.style.cursor = "pointer";
      div.title = review ? "Clique para marcar como lida e ocultar" : "Clique para marcar como lida";
      div.addEventListener("click", async () => {
        await markNotificationRead(n.id);
        div.remove();
        if (!elNotifList.querySelector(".notif-item")) {
          elNotifList.innerHTML =
            '<p class="form-hint">Nenhuma notificação recente. Avaliações de clientes aparecem aqui por até 5 dias.</p>';
        }
        const remaining = elNotifList.querySelectorAll(".notif-item:not(.read-done)");
        document.title =
          remaining.length > 0
            ? `(${remaining.length}) Minha Conta | Servix`
            : "Minha Conta | Servix Solutions";
      });
    }
    elNotifList.appendChild(div);
  });
}

prefsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!providerId) return;
  const { error } = await updateProviderPrefs(providerId, {
    notifyManyRequests: prefMany.checked,
    notifyProfileChanges: prefProfile.checked,
  });
  if (error) showAppAlert("Erro ao salvar: " + error.message, { variant: "error" });
  else showAppAlert("Preferências salvas.", { variant: "success" });
});

markAllBtn.addEventListener("click", async () => {
  if (!providerId) return;
  await markAllNotificationsRead(providerId);
  const { data } = await fetchNotifications(providerId);
  renderNotifications(data || []);
  document.title = "Minha Conta | Servix Solutions";
});

async function init() {
  if (!db) {
    show("guest");
    return;
  }
  show("loading");
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    show("guest");
    return;
  }

  const { data: provider } = await db
    .from("providers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!provider) {
    show("guest");
    return;
  }

  providerId = provider.id;
  const prefs = await getProviderPrefs(providerId);
  prefMany.checked = prefs.notifyManyRequests;
  prefProfile.checked = prefs.notifyProfileChanges;

  const { data: notifs } = await fetchNotifications(providerId);
  renderNotifications(notifs || []);

  document.title =
    getUnreadCount(notifs) > 0
      ? `(${getUnreadCount(notifs)}) Minha Conta | Servix`
      : "Minha Conta | Servix Solutions";

  show("main");
}

init();

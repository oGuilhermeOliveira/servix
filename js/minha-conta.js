import { supabase } from "./supabase-init.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";
import {
  fetchNotifications,
  getProviderPrefs,
  markAllNotificationsRead,
  markNotificationRead,
  updateProviderPrefs,
  getUnreadCount,
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

function renderNotifications(items) {
  elNotifList.innerHTML = "";
  if (!items.length) {
    elNotifList.innerHTML = '<p class="form-hint">Nenhuma notificação ainda.</p>';
    return;
  }
  items.forEach((n) => {
    const div = document.createElement("div");
    div.className = "notif-item" + (n.read_at ? "" : " unread");
    div.innerHTML = `
      <strong>${n.title}</strong>
      <p style="margin:0.3rem 0 0">${n.message}</p>
      <time>${formatDate(n.created_at)}</time>
    `;
    if (!n.read_at) {
      div.style.cursor = "pointer";
      div.addEventListener("click", async () => {
        await markNotificationRead(n.id);
        div.classList.remove("unread");
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
  if (error) alert("Erro ao salvar: " + error.message);
  else alert("Preferências salvas.");
});

markAllBtn.addEventListener("click", async () => {
  if (!providerId) return;
  await markAllNotificationsRead(providerId);
  const { data } = await fetchNotifications(providerId);
  renderNotifications(data || []);
});

async function init() {
  if (!supabase) {
    show("guest");
    return;
  }
  show("loading");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    show("guest");
    return;
  }

  const { data: provider } = await supabase
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

  document.title = getUnreadCount(notifs) > 0
    ? `(${getUnreadCount(notifs)}) Minha Conta | Servix`
    : "Minha Conta | Servix Solutions";

  show("main");
}

init();

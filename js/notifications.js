import { db } from "./firebase-init.js";

const MANY_REQUESTS_THRESHOLD = 5;
/** Avaliações somem da lista após 5 dias ou quando marcadas como lidas. */
export const REVIEW_NOTIFICATION_TTL_MS = 5 * 24 * 60 * 60 * 1000;

export async function getProviderPrefs(providerId) {
  const { data } = await db
    .from("providers")
    .select("notify_many_requests, notify_profile_changes")
    .eq("id", providerId)
    .single();
  return {
    notifyManyRequests: data?.notify_many_requests !== false,
    notifyProfileChanges: data?.notify_profile_changes !== false,
  };
}

export async function updateProviderPrefs(providerId, prefs) {
  return db
    .from("providers")
    .update({
      notify_many_requests: prefs.notifyManyRequests,
      notify_profile_changes: prefs.notifyProfileChanges,
    })
    .eq("id", providerId);
}

export async function createNotification(providerId, type, title, message, options) {
  const extra = options || {};
  const row = {
    provider_id: providerId,
    type,
    title,
    message,
  };
  if (extra.id) row.id = extra.id;

  try {
    const { error } = await db.rpc("create_provider_notification", {
      p_provider_id: providerId,
      p_type: type,
      p_title: title,
      p_message: message,
    });
    if (error) {
      return db.from("provider_notifications").insert(row);
    }
    return { error: null };
  } catch {
    return db.from("provider_notifications").insert(row);
  }
}

export function parseReviewNotificationPayload(notification) {
  if (notification?.type !== "provider_review") return null;
  try {
    const data = JSON.parse(notification.message || "{}");
    return {
      rating: Number(data.rating),
      comment: String(data.comment || "").trim(),
      clientName: String(data.clientName || data.client_name || "Cliente").trim(),
      areaName: String(data.areaName || data.area_name || "Serviço").trim(),
    };
  } catch {
    return {
      rating: null,
      comment: String(notification.message || "").trim(),
      clientName: "Cliente",
      areaName: "Serviço",
    };
  }
}

/** Avaliações: oculta se lida ou com mais de 5 dias. Demais tipos permanecem visíveis. */
export function isNotificationVisible(notification) {
  if (!notification) return false;
  if (notification.type === "provider_review") {
    if (notification.read_at) return false;
    const created = new Date(notification.created_at).getTime();
    if (!Number.isFinite(created)) return true;
    return Date.now() - created <= REVIEW_NOTIFICATION_TTL_MS;
  }
  return true;
}

export function filterVisibleNotifications(notifications) {
  return (notifications || []).filter(isNotificationVisible);
}

export async function notifyProviderReview(providerId, review) {
  if (!providerId || !review) return;
  const clientName = (review.client_name || "Cliente").trim();
  const areaName = (review.area_name || review.category || "Serviço").trim();
  const payload = {
    rating: Number(review.rating),
    comment: String(review.comment || "").trim(),
    clientName,
    areaName,
  };
  const reviewId = review.id || `${providerId}__${Date.now()}`;
  await createNotification(
    providerId,
    "provider_review",
    `Nova avaliação de ${clientName}`,
    JSON.stringify(payload),
    { id: `${providerId}__review__${reviewId}` }
  );
}

export async function notifyManyRequestsIfNeeded(providerId, matchingCount) {
  const prefs = await getProviderPrefs(providerId);
  if (!prefs.notifyManyRequests || matchingCount < MANY_REQUESTS_THRESHOLD) return;

  const { count } = await db
    .from("provider_notifications")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("type", "many_requests")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((count || 0) > 0) return;

  await createNotification(
    providerId,
    "many_requests",
    "Muitos pedidos disponíveis",
    `Você tem ${matchingCount} pedidos de serviço na sua área. Aproveite para entrar em contato com os clientes.`
  );
}

export async function notifyProfileUpdated(providerId) {
  const prefs = await getProviderPrefs(providerId);
  if (!prefs.notifyProfileChanges) return;

  await createNotification(
    providerId,
    "profile_updated",
    "Cadastro atualizado",
    "Seu perfil foi alterado com sucesso. Verifique se os dados estão corretos no painel."
  );
}

export async function fetchNotifications(providerId, limit = 40) {
  const res = await db
    .from("provider_notifications")
    .select("id, type, title, message, read_at, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error || !res.data) return res;
  return { ...res, data: filterVisibleNotifications(res.data) };
}

export async function markNotificationRead(id) {
  return db
    .from("provider_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllNotificationsRead(providerId) {
  return db
    .from("provider_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("provider_id", providerId)
    .is("read_at", null);
}

export function getUnreadCount(notifications) {
  return filterVisibleNotifications(notifications).filter((n) => !n.read_at).length;
}

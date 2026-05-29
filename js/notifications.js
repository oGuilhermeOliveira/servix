import { db } from "./firebase-init.js";

const MANY_REQUESTS_THRESHOLD = 5;

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

export async function createNotification(providerId, type, title, message) {
  try {
    const { error } = await db.rpc("create_provider_notification", {
      p_provider_id: providerId,
      p_type: type,
      p_title: title,
      p_message: message,
    });
    if (error) {
      const ins = await db.from("provider_notifications").insert({
        provider_id: providerId,
        type,
        title,
        message,
      });
      return ins;
    }
    return { error: null };
  } catch {
    return { error: { message: "Falha ao criar notificação" } };
  }
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

export async function fetchNotifications(providerId, limit = 30) {
  return db
    .from("provider_notifications")
    .select("id, type, title, message, read_at, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(limit);
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
  return (notifications || []).filter((n) => !n.read_at).length;
}

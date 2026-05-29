import { uploadProviderAvatar, validateAvatarFile } from "./avatar-upload.js";
import { saveProviderServiceAreas } from "./provider-areas.js";

export const PENDING_PROVIDER_REG_KEY = "servix:pending-provider-registration";

export function isProviderProfileIncomplete(provider) {
  const name = (provider?.full_name || "").trim();
  const phone = (provider?.phone || "").trim();
  return !name || !phone;
}

/** Dados do formulário serializáveis para localStorage (sem senha nem arquivo). */
export function toStorableRegistrationPayload(formData) {
  return {
    fullName: formData.fullName || "",
    phone: formData.phone || "",
    areaIds: Array.isArray(formData.areaIds) ? formData.areaIds : [],
    composed: formData.composed || { address: "", city: "", state: "", cep: "" },
  };
}

export function savePendingProviderRegistration(email, payload) {
  const data = {
    email: (email || "").toLowerCase().trim(),
    payload: toStorableRegistrationPayload(payload),
  };
  try {
    localStorage.setItem(PENDING_PROVIDER_REG_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
  return data;
}

export function loadPendingProviderRegistration() {
  try {
    const raw = localStorage.getItem(PENDING_PROVIDER_REG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPendingProviderRegistration() {
  try {
    localStorage.removeItem(PENDING_PROVIDER_REG_KEY);
  } catch {
    // ignore storage errors
  }
}

async function uploadAvatar(userId, file) {
  if (!file) return null;
  const check = validateAvatarFile(file);
  if (!check.ok) throw new Error(check.message);
  return uploadProviderAvatar(userId, file, null);
}

export async function saveProviderProfile(db, userId, email, profile) {
  const upsertData = {
    auth_user_id: userId,
    email: email.toLowerCase().trim(),
    full_name: (profile.fullName || "").trim(),
    phone: (profile.phone || "").trim(),
    address: (profile.address || "").trim(),
    city: profile.city || "",
    state: profile.state || "",
    cep: profile.cep || null,
    lat: profile.lat ?? null,
    lng: profile.lng ?? null,
    terms_accepted_at: new Date().toISOString(),
  };
  if (profile.avatarUrl) {
    upsertData.avatar_url = profile.avatarUrl;
  }
  const upsert = await db.from("providers").upsert(upsertData, { onConflict: "auth_user_id" }).select("id").maybeSingle();
  if (upsert.error) throw upsert.error;

  let providerId = upsert.data?.id;
  if (!providerId) {
    const found = await db.from("providers").select("id").eq("auth_user_id", userId).maybeSingle();
    if (found.error) throw found.error;
    providerId = found.data?.id;
  }
  if (!providerId) throw new Error("Nao foi possivel salvar o perfil de prestador.");

  const areaSave = await saveProviderServiceAreas(db, providerId, profile.areaIds || []);
  if (areaSave.error) throw new Error(areaSave.error.message || "Erro ao salvar areas de atuacao.");
  return providerId;
}

export async function finalizeProviderRegistration(db, user, email, payload) {
  const composed = payload.composed || {};
  let avatarUrl = null;

  if (payload.photo) {
    try {
      avatarUrl = await uploadAvatar(user.id, payload.photo);
    } catch (error) {
      console.warn("Foto nao enviada no cadastro:", error);
    }
  }

  return saveProviderProfile(db, user.id, email, {
    fullName: payload.fullName,
    phone: payload.phone,
    address: composed.address || "",
    city: composed.city || "",
    state: composed.state || "",
    cep: composed.cep || null,
    avatarUrl,
    areaIds: payload.areaIds || [],
    lat: null,
    lng: null,
  });
}

/** Conclui cadastro pendente (localStorage) se o perfil estiver ausente ou incompleto. */
export async function tryCompletePendingProviderRegistration(db, user, email, provider) {
  if (!db || !user) return false;
  if (provider && !isProviderProfileIncomplete(provider)) return false;

  const pending = loadPendingProviderRegistration();
  const normalizedEmail = (email || user.email || "").toLowerCase().trim();
  if (!pending || pending.email !== normalizedEmail || !pending.payload) return false;

  await finalizeProviderRegistration(db, user, normalizedEmail, pending.payload);
  clearPendingProviderRegistration();
  return true;
}

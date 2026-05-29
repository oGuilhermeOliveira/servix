/**
 * Foto de perfil: comprime no navegador e grava URL no Firestore (sem depender de Storage).
 */
import { compressImageToDataUrl } from "./avatar-image.js";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function validateAvatarFile(file) {
  if (!file) return { ok: false, message: "Nenhuma imagem selecionada." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: "Use JPG, PNG ou WebP." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "A imagem deve ter no máximo 5 MB." };
  }
  return { ok: true };
}

/**
 * @param {string} _userId
 * @param {File} file
 * @param {string|null} _previousUrl
 * @returns {Promise<string>} data URL ou URL https
 */
export async function uploadProviderAvatar(_userId, file, _previousUrl) {
  const check = validateAvatarFile(file);
  if (!check.ok) throw new Error(check.message);
  return compressImageToDataUrl(file);
}

/**
 * Upload de foto de perfil do prestador (Cloudinary).
 */
import { uploadImageToCloudinary } from "./cloudinary-upload.js";

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
 * Envia avatar e retorna URL pública (Cloudinary).
 * @param {string} userId
 * @param {File} file
 * @param {string|null} _previousUrl - ignorado (remoção exige API secret no servidor)
 */
export async function uploadProviderAvatar(userId, file, _previousUrl) {
  const check = validateAvatarFile(file);
  if (!check.ok) throw new Error(check.message);

  return uploadImageToCloudinary(userId, file);
}

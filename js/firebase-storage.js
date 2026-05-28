/**
 * firebase-storage.js
 * Upload de avatares usando Firebase Storage (plano gratuito Spark).
 * Limite gratuito: 5 GB armazenamento, 1 GB/dia download, 20k operações/dia.
 */

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Inicializa o app Firebase apenas uma vez
const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const storage = getStorage(firebaseApp);

/**
 * Faz upload do avatar do prestador para Firebase Storage.
 * Caminho: avatars/{userId}/avatar-{timestamp}.{ext}
 *
 * @param {string} userId  - UID do usuário (Supabase auth uid)
 * @param {File}   file    - Arquivo de imagem selecionado pelo usuário
 * @returns {Promise<string>} URL pública da imagem
 */
export async function uploadAvatarFirebase(userId, file) {
  if (!file || !userId) return null;

  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `avatars/${userId}/avatar-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  // Metadados para cache e tipo correto
  const metadata = { contentType: file.type || "image/jpeg" };

  await uploadBytes(storageRef, file, metadata);
  const url = await getDownloadURL(storageRef);
  return url;
}

/**
 * Tenta deletar um avatar antigo (falha silenciosa se não existir).
 * @param {string} oldUrl - URL antiga do Firebase Storage
 */
export async function deleteOldAvatar(oldUrl) {
  if (!oldUrl || !oldUrl.includes("firebasestorage")) return;
  try {
    // Extrai o path do URL do Firebase Storage
    const url  = new URL(oldUrl);
    const path = decodeURIComponent(url.pathname.split("/o/")[1]?.split("?")[0] || "");
    if (!path) return;
    await deleteObject(ref(storage, path));
  } catch {
    // Silencioso — arquivo pode já ter sido deletado
  }
}

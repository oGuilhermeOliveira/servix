/**
 * Upload de imagens via Cloudinary (plano gratuito, sem cartão).
 * Requer preset "Unsigned" no painel do Cloudinary.
 */

let configCache = null;

async function getCloudinaryConfig() {
  if (configCache) return configCache;
  const mod = await import("./cloudinary-config.js");
  const cfg = mod.cloudinaryConfig || mod;
  const cloudName = String(cfg?.cloudName || "").trim();
  const uploadPreset = String(cfg?.uploadPreset || "").trim();
  const valid =
    cloudName &&
    uploadPreset &&
    !cloudName.includes("SEU_CLOUD") &&
    !uploadPreset.includes("SEU_UPLOAD");
  if (!valid) {
    throw new Error(
      "Configure js/cloudinary-config.js (copie de cloudinary-config.example.js)."
    );
  }
  configCache = { cloudName, uploadPreset };
  return configCache;
}

/**
 * @param {string} userId - UID do prestador (Firebase Auth)
 * @param {File} file
 * @returns {Promise<string>} URL HTTPS da imagem
 */
export async function uploadImageToCloudinary(userId, file) {
  const { cloudName, uploadPreset } = await getCloudinaryConfig();

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "servix/providers");
  form.append("public_id", `provider_${userId}_${Date.now()}`);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || data?.message || "Falha no upload Cloudinary.";
    throw new Error(msg);
  }
  if (!data.secure_url) {
    throw new Error("Cloudinary não retornou URL da imagem.");
  }
  return data.secure_url;
}

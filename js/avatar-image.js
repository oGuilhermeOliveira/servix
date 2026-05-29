function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel ler a imagem."));
    };
    img.src = url;
  });
}

/** Reduz imagem para data URL (exibicao imediata no dashboard, sem Storage). */
export async function compressImageToDataUrl(file, maxDim = 256, quality = 0.78) {
  if (!file) throw new Error("Arquivo de imagem invalido.");

  let source = null;
  if (typeof createImageBitmap === "function") {
    try {
      source = await createImageBitmap(file);
    } catch {
      source = await loadImageFromFile(file);
    }
  } else {
    source = await loadImageFromFile(file);
  }

  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w0, h0, 1));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nao foi possivel processar a imagem.");

  ctx.drawImage(source, 0, 0, w, h);
  if (typeof source.close === "function") source.close();

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (!dataUrl || dataUrl.length < 32) {
    throw new Error("Falha ao gerar imagem.");
  }
  if (dataUrl.length > 750000) {
    return compressImageToDataUrl(file, Math.round(maxDim * 0.75), quality * 0.9);
  }
  return dataUrl;
}

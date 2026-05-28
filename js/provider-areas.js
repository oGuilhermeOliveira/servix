import { SERVICE_CATALOG } from "./service-catalog.js";

/** Lista padrão de áreas (slug = id) para fallback e seed. */
export function getDefaultServiceAreas() {
  const bySlug = new Map();
  (SERVICE_CATALOG || []).forEach(function (item) {
    if (!item?.slug || bySlug.has(item.slug)) return;
    bySlug.set(item.slug, {
      id: item.slug,
      slug: item.slug,
      name: item.label || item.slug,
    });
  });
  return Array.from(bySlug.values()).sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}

/** Junta áreas do banco com catálogo padrão, sem perder nenhuma opção. */
export function mergeWithDefaultServiceAreas(rows) {
  const merged = new Map();
  (getDefaultServiceAreas() || []).forEach(function (row) {
    merged.set(row.slug || row.id, row);
  });
  (rows || []).forEach(function (row) {
    const key = row?.slug || row?.id;
    if (!key) return;
    merged.set(key, {
      id: row.id || row.slug,
      slug: row.slug || row.id,
      name: row.name || areaNameBySlug(key),
    });
  });
  return Array.from(merged.values()).sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}

export function areaNameBySlug(slug) {
  const row = getDefaultServiceAreas().find(function (a) {
    return a.slug === slug || a.id === slug;
  });
  return row?.name || slug;
}

/** Garante documentos em service_areas para os slugs selecionados. */
export async function ensureServiceAreaDocs(supabase, areaIds) {
  if (!supabase || !areaIds?.length) return;
  const catalog = getDefaultServiceAreas();
  const bySlug = new Map(catalog.map(function (a) {
    return [a.slug, a];
  }));

  for (const areaId of areaIds) {
    const row = bySlug.get(areaId) || { id: areaId, slug: areaId, name: areaId };
    await supabase.from("service_areas").insert({
      id: row.id,
      slug: row.slug,
      name: row.name,
    });
  }
}

/**
 * Salva vínculos prestador ↔ áreas (substitui os anteriores).
 * Usa id estável no Firestore: {providerId}__{areaSlug}
 */
export async function saveProviderServiceAreas(supabase, providerId, areaIds) {
  if (!supabase || !providerId) return { error: { message: "Prestador invalido." } };
  if (!areaIds?.length) return { error: { message: "Nenhuma area selecionada." } };

  await ensureServiceAreaDocs(supabase, areaIds);

  const del = await supabase.from("provider_service_areas").delete().eq("provider_id", providerId);
  if (del.error) return del;

  for (const areaId of areaIds) {
    const link = {
      id: `${providerId}__${areaId}`,
      provider_id: providerId,
      area_id: areaId,
      service_area_id: areaId,
    };
    const ins = await supabase.from("provider_service_areas").insert(link);
    if (ins.error) return ins;
  }

  return { error: null };
}

/** Carrega áreas do prestador para exibição (tags, filtros). */
export async function loadProviderAreas(supabase, providerId) {
  if (!supabase || !providerId) return [];

  const { data: links, error } = await supabase
    .from("provider_service_areas")
    .select("area_id, service_area_id")
    .eq("provider_id", providerId);

  if (error || !links?.length) return [];

  const catalog = getDefaultServiceAreas();
  const bySlug = new Map(catalog.map(function (a) {
    return [a.slug, a];
  }));

  const areas = [];
  const seen = new Set();
  links.forEach(function (link) {
    const slug = link.area_id || link.service_area_id;
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const fromDb = bySlug.get(slug);
    areas.push(fromDb || { id: slug, slug, name: areaNameBySlug(slug) });
  });

  return areas.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}

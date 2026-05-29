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
export async function ensureServiceAreaDocs(db, areaIds) {
  if (!db || !areaIds?.length) return;
  const catalog = getDefaultServiceAreas();
  const bySlug = new Map(catalog.map(function (a) {
    return [a.slug, a];
  }));

  for (const areaId of areaIds) {
    const row = bySlug.get(areaId) || { id: areaId, slug: areaId, name: areaId };
    await db.from("service_areas").upsert(
      { id: row.slug, slug: row.slug, name: row.name },
      { onConflict: "id" }
    );
  }
}

/**
 * Salva vínculos prestador ↔ áreas (substitui os anteriores).
 * Usa id estável no Firestore: {providerId}__{areaSlug}
 */
export async function saveProviderServiceAreas(db, providerId, areaIds) {
  if (!db || !providerId) return { error: { message: "Prestador invalido." } };
  if (!areaIds?.length) return { error: { message: "Nenhuma area selecionada." } };

  await ensureServiceAreaDocs(db, areaIds);

  const del = await db.from("provider_service_areas").delete().eq("provider_id", providerId);
  if (del.error) return del;

  for (const areaId of areaIds) {
    const link = {
      id: `${providerId}__${areaId}`,
      provider_id: providerId,
      area_id: areaId,
      service_area_id: areaId,
    };
    const ins = await db.from("provider_service_areas").insert(link);
    if (ins.error) return ins;
  }

  return { error: null };
}

/** Carrega áreas do prestador para exibição (tags, filtros). */
export async function loadProviderAreas(db, providerId) {
  if (!db || !providerId) return [];

  const { data: links, error } = await db
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

/** Garante documento do prestador vinculado ao usuário autenticado. */
export async function ensureProviderRow(db, user, email) {
  const normalizedEmail = (email || user.email || "").toLowerCase().trim();
  const byAuth = await db.from("providers").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (byAuth.error) throw byAuth.error;
  if (byAuth.data?.id) return byAuth.data.id;

  const byEmail = await db.from("providers").select("id,auth_user_id").eq("email", normalizedEmail).maybeSingle();
  if (byEmail.error) throw byEmail.error;
  if (byEmail.data?.id) {
    if (!byEmail.data.auth_user_id) {
      const upd = await db
        .from("providers")
        .update({ auth_user_id: user.id })
        .eq("id", byEmail.data.id)
        .select("id")
        .single();
      if (upd.error) throw upd.error;
      return upd.data.id;
    }
    return byEmail.data.id;
  }

  const ins = await db
    .from("providers")
    .insert({
      id: user.id,
      auth_user_id: user.id,
      email: normalizedEmail,
      full_name: "",
      phone: "",
      address: "",
    })
    .select("id")
    .single();

  if (!ins.error) return ins.data.id;

  const retry = await db.from("providers").select("id").eq("email", normalizedEmail).maybeSingle();
  if (retry.error) throw retry.error;
  if (retry.data?.id) return retry.data.id;
  throw ins.error;
}

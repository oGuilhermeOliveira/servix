/**
 * Categorias do formulário da home → slugs de service_areas no Supabase.
 */
export const HERO_CATEGORY_TO_AREA_SLUGS = {
  "Reformas e Reparos": [
    "encanador",
    "pintor",
    "eletricista",
    "pedreiro",
    "marceneiro",
    "jardineiro",
    "ar_condicionado",
  ],
  "Servicos Domesticos": ["diarista"],
  "Design e Tecnologia": ["design", "informatica", "fotografo"],
  "Saude e Bem-estar": ["bem_estar"],
};

export function getAreaSlugsForHeroCategory(label) {
  if (!label) return [];
  const list = HERO_CATEGORY_TO_AREA_SLUGS[label.trim()];
  return Array.isArray(list) ? list : [];
}

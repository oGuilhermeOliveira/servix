/**
 * Categorias da home → slugs (legado / dashboard).
 * Foco em serviços para casa.
 */
export const HERO_CATEGORY_TO_AREA_SLUGS = {
  "Reformas e Reparos": [
    "encanador", "pintor", "eletricista", "pedreiro", "marceneiro", "jardineiro",
    "ar_condicionado", "desentupidor", "marido_aluguel", "vidraceiro", "gesso_drywall",
    "serralheria", "redes_protecao", "tapeceiro", "dedetizador", "seguranca_eletronica",
    "eletrodomesticos", "chaveiro", "limpeza_pos_obra", "impermeabilizacao", "arquiteto",
  ],
  "Servicos Domesticos": [
    "diarista", "passadeira", "cozinheira", "baba", "cuidador",
  ],
  "Manutencao do Lar": [
    "informatica", "redes_cabeamento", "bem_estar", "manicure", "cabeleireiro",
  ],
};

export function getAreaSlugsForHeroCategory(label) {
  if (!label) return [];
  const list = HERO_CATEGORY_TO_AREA_SLUGS[label.trim()];
  return Array.isArray(list) ? list : [];
}

export function getAreaSlugsForServiceSlug(slug) {
  if (!slug) return [];
  return [String(slug).trim()];
}

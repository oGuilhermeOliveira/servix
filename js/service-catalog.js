/**
 * Catálogo focado em serviços para casa (busca na home).
 * slug → service_areas no Supabase
 */
export const SERVICE_GROUPS = {
  REFORMAS: "Reformas e Reparos",
  DOMESTICOS: "Servicos Domesticos",
  LAR: "Manutencao do Lar",
};

/** @type {{ id: string, label: string, slug: string, group: string, keywords: string[] }[]} */
export const SERVICE_CATALOG = [
  // --- Reformas e reparos na casa ---
  { id: "eletricista", label: "Eletricista residencial", slug: "eletricista", group: SERVICE_GROUPS.REFORMAS, keywords: ["eletricista", "eletrica", "luz", "casa", "disjuntor", "residencial"] },
  { id: "eletricista-instalacao", label: "Instalacao eletrica na casa", slug: "eletricista", group: SERVICE_GROUPS.REFORMAS, keywords: ["instalacao", "tomada", "fiacao", "interruptor"] },
  { id: "eletricista-manutencao", label: "Conserto eletrico residencial", slug: "eletricista", group: SERVICE_GROUPS.REFORMAS, keywords: ["conserto", "manutencao", "reparo", "curto", "queda de energia"] },
  { id: "ventilador", label: "Instalacao de ventilador de teto", slug: "eletricista", group: SERVICE_GROUPS.REFORMAS, keywords: ["ventilador", "teto", "quarto"] },
  { id: "chuveiro", label: "Instalacao e conserto de chuveiro", slug: "eletricista", group: SERVICE_GROUPS.REFORMAS, keywords: ["chuveiro", "aquecedor", "banheiro"] },

  { id: "encanador", label: "Encanador residencial", slug: "encanador", group: SERVICE_GROUPS.REFORMAS, keywords: ["encanador", "cano", "hidraulica", "torneira", "banheiro", "cozinha"] },
  { id: "encanador-vazamento", label: "Conserto de vazamento em casa", slug: "encanador", group: SERVICE_GROUPS.REFORMAS, keywords: ["vazamento", "goteira", "infiltracao", "pia", "vaso"] },
  { id: "desentupidor", label: "Desentupidor", slug: "desentupidor", group: SERVICE_GROUPS.REFORMAS, keywords: ["desentupidor", "entupido", "pia", "ralo", "vaso", "esgoto"] },
  { id: "caixa-dagua", label: "Limpeza de caixa d'agua", slug: "encanador", group: SERVICE_GROUPS.REFORMAS, keywords: ["caixa dagua", "caixa de agua", "limpeza caixa"] },

  { id: "pintor", label: "Pintor de casas e apartamentos", slug: "pintor", group: SERVICE_GROUPS.REFORMAS, keywords: ["pintor", "pintura", "parede", "tinta", "apartamento", "sala"] },
  { id: "pedreiro", label: "Pedreiro para reforma", slug: "pedreiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["pedreiro", "reforma", "alvenaria", "reboco", "quebrar parede"] },
  { id: "gesso-drywall", label: "Gesso e drywall", slug: "gesso_drywall", group: SERVICE_GROUPS.REFORMAS, keywords: ["gesso", "drywall", "forro", "divisoria", "sanca"] },
  { id: "impermeabilizacao", label: "Impermeabilizacao e infiltracoes", slug: "impermeabilizacao", group: SERVICE_GROUPS.REFORMAS, keywords: ["impermeabilizacao", "infiltracao", "laje", "telhado", "umidade", "mofo"] },
  { id: "telhado", label: "Conserto de telhado e calhas", slug: "impermeabilizacao", group: SERVICE_GROUPS.REFORMAS, keywords: ["telhado", "calha", "goteira", "telha"] },

  { id: "marceneiro", label: "Marceneiro e moveis planejados", slug: "marceneiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["marceneiro", "moveis", "armario", "cozinha planejada", "closet"] },
  { id: "montagem-moveis", label: "Montagem de moveis", slug: "marido_aluguel", group: SERVICE_GROUPS.REFORMAS, keywords: ["montagem", "ikea", "moveis", "guarda roupa", "estante"] },
  { id: "portas-fechaduras", label: "Conserto de portas e fechaduras", slug: "chaveiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["porta", "fechadura", "dobradica", "trinco", "maçaneta"] },
  { id: "chaveiro", label: "Chaveiro residencial", slug: "chaveiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["chaveiro", "chave", "troca fechadura", "porta travada"] },

  { id: "vidraceiro", label: "Vidraceiro (box, janelas, espelhos)", slug: "vidraceiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["vidraceiro", "box banheiro", "janela", "vidro", "espelho"] },
  { id: "serralheria", label: "Serralheria (portao, grades)", slug: "serralheria", group: SERVICE_GROUPS.REFORMAS, keywords: ["serralheria", "portao", "grade", "ferro", "solda"] },
  { id: "redes-protecao", label: "Redes de protecao em janelas", slug: "redes_protecao", group: SERVICE_GROUPS.REFORMAS, keywords: ["rede protecao", "sacada", "janela", "crianca", "apartamento"] },
  { id: "tapeceiro", label: "Tapeceiro (sofas e cortinas)", slug: "tapeceiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["tapeceiro", "sofa", "estofado", "cortina", "limpeza sofa"] },

  { id: "jardineiro", label: "Jardinagem e quintal", slug: "jardineiro", group: SERVICE_GROUPS.REFORMAS, keywords: ["jardineiro", "quintal", "grama", "podar", "paisagismo"] },
  { id: "ar-condicionado", label: "Ar condicionado (instalacao e limpeza)", slug: "ar_condicionado", group: SERVICE_GROUPS.REFORMAS, keywords: ["ar condicionado", "split", "limpeza ar", "climatizacao"] },
  { id: "dedetizador", label: "Dedetizacao residencial", slug: "dedetizador", group: SERVICE_GROUPS.REFORMAS, keywords: ["dedetizador", "barata", "formiga", "cupim", "pragas", "casa"] },
  { id: "seguranca-eletronica", label: "Cameras e alarme para casa", slug: "seguranca_eletronica", group: SERVICE_GROUPS.REFORMAS, keywords: ["camera", "alarme", "cftv", "seguranca", "casa", "porteiro"] },

  { id: "marido-aluguel", label: "Marido de aluguel", slug: "marido_aluguel", group: SERVICE_GROUPS.REFORMAS, keywords: ["marido de aluguel", "faz tudo", "reparos", "pequenos servicos", "casa"] },
  { id: "instalacao-tv", label: "Instalacao de TV e suporte na parede", slug: "marido_aluguel", group: SERVICE_GROUPS.REFORMAS, keywords: ["tv", "suporte tv", "parede", "painel"] },
  { id: "limpeza-pos-obra", label: "Limpeza pos-obra", slug: "limpeza_pos_obra", group: SERVICE_GROUPS.REFORMAS, keywords: ["pos obra", "limpeza fina", "reforma limpeza", "entulho"] },

  { id: "eletrodomesticos", label: "Conserto de geladeira e freezer", slug: "eletrodomesticos", group: SERVICE_GROUPS.REFORMAS, keywords: ["geladeira", "freezer", "refrigerador", "nao gela"] },
  { id: "lava-roupa", label: "Conserto de maquina de lavar", slug: "eletrodomesticos", group: SERVICE_GROUPS.REFORMAS, keywords: ["lava roupa", "maquina de lavar", "secadora"] },
  { id: "fogao", label: "Conserto de fogao e cooktop", slug: "eletrodomesticos", group: SERVICE_GROUPS.REFORMAS, keywords: ["fogao", "cooktop", "forno", "queimador"] },
  { id: "microondas", label: "Conserto de micro-ondas", slug: "eletrodomesticos", group: SERVICE_GROUPS.REFORMAS, keywords: ["microondas", "micro ondas"] },

  // --- Servicos domesticos ---
  { id: "diarista", label: "Diarista e faxina", slug: "diarista", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["diarista", "faxina", "limpeza", "casa", "apartamento", "domestica"] },
  { id: "passadeira", label: "Passadeira", slug: "passadeira", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["passadeira", "passar roupa", "domestico"] },
  { id: "cozinheira", label: "Cozinheira em casa", slug: "cozinheira", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["cozinheira", "cozinhar", "almoco", "jantar", "domestica"] },
  { id: "baba", label: "Baba", slug: "baba", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["baba", "bebe", "crianca", "cuidar filho", "domestica"] },
  { id: "cuidador", label: "Cuidador de idosos em casa", slug: "cuidador", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["cuidador", "idoso", "acompanhante", "casa", "home care"] },
  { id: "organizacao", label: "Organizacao e arrumacao da casa", slug: "diarista", group: SERVICE_GROUPS.DOMESTICOS, keywords: ["organizar", "arrumar", "closet", "armario", "declutter"] },

  // --- Manutencao do lar (tecnologia e conforto em casa) ---
  { id: "wifi-casa", label: "Wi-Fi e internet em casa", slug: "redes_cabeamento", group: SERVICE_GROUPS.LAR, keywords: ["wifi", "internet", "roteador", "rede", "sinal", "casa"] },
  { id: "informatica", label: "Informatica e PC em casa", slug: "informatica", group: SERVICE_GROUPS.LAR, keywords: ["computador", "pc", "virus", "formatar", "lento", "casa"] },
  { id: "notebook", label: "Conserto de notebook em domicilio", slug: "informatica", group: SERVICE_GROUPS.LAR, keywords: ["notebook", "laptop", "nao liga", "tela"] },
  { id: "bem-estar", label: "Massagem e bem-estar em casa", slug: "bem_estar", group: SERVICE_GROUPS.LAR, keywords: ["massagem", "relaxamento", "domicilio", "casa"] },
  { id: "manicure-domicilio", label: "Manicure e pedicure em casa", slug: "manicure", group: SERVICE_GROUPS.LAR, keywords: ["manicure", "pedicure", "unha", "domicilio", "casa"] },
  { id: "cabeleireiro-domicilio", label: "Cabeleireiro em casa", slug: "cabeleireiro", group: SERVICE_GROUPS.LAR, keywords: ["cabeleireiro", "corte", "cabelo", "domicilio", "casa"] },

  { id: "arquiteto-reforma", label: "Arquiteto para reforma da casa", slug: "arquiteto", group: SERVICE_GROUPS.REFORMAS, keywords: ["arquiteto", "planta", "reforma", "projeto", "casa", "apartamento"] },
];

function normalizeQuery(q) {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/**
 * @param {string} query
 * @param {number} [limit=8]
 */
export function searchServices(query, limit = 8) {
  const q = normalizeQuery(query);
  if (!q) return [];

  const scored = SERVICE_CATALOG.map((item) => {
    const label = normalizeQuery(item.label);
    const group = normalizeQuery(item.group);
    const keys = item.keywords.map(normalizeQuery);
    let score = 0;
    if (label.startsWith(q)) score += 100;
    else if (label.includes(q)) score += 60;
    if (keys.some((k) => k.startsWith(q))) score += 80;
    else if (keys.some((k) => k.includes(q))) score += 40;
    if (group.includes(q)) score += 15;
    return { item, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, "pt-BR"));
  return scored.slice(0, limit).map((x) => x.item);
}

export function findServiceById(id) {
  return SERVICE_CATALOG.find((s) => s.id === id) || null;
}

export function getCatalogSlugs() {
  return [...new Set(SERVICE_CATALOG.map((s) => s.slug))];
}

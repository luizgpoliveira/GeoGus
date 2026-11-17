/**
 * Centros de grandes caldeiras associados a supererupções documentadas.
 * A seleção é deliberadamente conservadora e baseada em exemplos citados pelo USGS.
 * "Supervulcão" não é uma categoria formal e universal do catálogo GVP nem indica risco atual.
 * As coordenadas usam o registro GVP; coordenadas curadas ficam como fallback se o catálogo não responder.
 */
export interface SupervolcanoInfo {
  vn: number;
  displayName: string;
  country: string;
  lat: number;
  lon: number;
  classification: 'supereruption-documented' | 'large-caldera-system' | 'large-caldera-candidate';
  evidence: string;
  sourceLabel: string;
  sourceUrl: string;
}

export const SUPER_VOLCANOES: Record<number, SupervolcanoInfo> = {
  325010: {
    vn: 325010,
    displayName: 'Yellowstone Caldera',
    classification: 'supereruption-documented',
    country: 'United States', lat: 44.43, lon: -110.67,
    evidence: 'O USGS documenta grandes erupções formadoras de caldeira, incluindo a Huckleberry Ridge Tuff (~2.450 km³) e a Lava Creek Tuff (~640 mil anos).',
    sourceLabel: 'USGS — Yellowstone / Questions About Supervolcanoes',
    sourceUrl: 'https://www.usgs.gov/volcanoes/yellowstone/questions-about-supervolcanoes',
  },
  323822: {
    vn: 323822,
    displayName: 'Long Valley Caldera',
    classification: 'supereruption-documented',
    country: 'United States', lat: 37.72, lon: -118.87,
    evidence: 'A caldeira formou-se durante a erupção volumosa do Bishop Tuff, descrita pelo USGS como uma supererupção (~760 mil anos).',
    sourceLabel: 'USGS — Long Valley Caldera',
    sourceUrl: 'https://www.usgs.gov/volcanoes/long-valley-caldera/',
  },
  327817: {
    vn: 327817,
    displayName: 'Valles Caldera',
    classification: 'large-caldera-system',
    country: 'United States', lat: 35.87, lon: -106.57,
    evidence: 'Grande sistema de caldeira citado pelo USGS entre os sistemas que produziram grandes erupções piroclásticas. Este cadastro o destaca como grande caldeira, sem afirmar VEI 8 confirmado.',
    sourceLabel: 'USGS — What is a supervolcano?',
    sourceUrl: 'https://www.usgs.gov/faqs/what-a-supervolcano-what-a-supereruption',
  },
  261090: {
    vn: 261090,
    displayName: 'Toba Caldera',
    classification: 'supereruption-documented',
    country: 'Indonesia', lat: 2.58, lon: 98.83,
    evidence: 'Grande caldeira de Sumatra associada à supererupção do Toba, há cerca de 74 mil anos.',
    sourceLabel: 'USGS — Questions About Supervolcanoes',
    sourceUrl: 'https://www.usgs.gov/volcanoes/yellowstone/questions-about-supervolcanoes',
  },
  241070: {
    vn: 241070,
    displayName: 'Taupo Caldera',
    classification: 'supereruption-documented',
    country: 'New Zealand', lat: -38.82, lon: 176.00,
    evidence: 'O USGS descreve a erupção Oruanui, há cerca de 22.600 anos, com aproximadamente 1.130 km³ de material, como supererupção.',
    sourceLabel: 'USGS — What is a supervolcano?',
    sourceUrl: 'https://www.usgs.gov/faqs/what-a-supervolcano-what-a-supereruption',
  },
  282080: {
    vn: 282080,
    displayName: 'Aira Caldera',
    country: 'Japan', lat: 31.5772, lon: 130.6589,
    classification: 'large-caldera-candidate',
    evidence: 'Grande caldeira do arco Ryukyu, associada ao sistema vulcânico de Sakurajima. O USGS indica que grandes caldeiras do Japão podem integrar o conjunto de sistemas candidatos frequentemente chamados de supervulcões; este marcador não afirma uma supererupção VEI 8 confirmada.',
    sourceLabel: 'Smithsonian GVP — Aira; USGS — examples of large caldera systems',
    sourceUrl: 'https://volcano.si.edu/volcano.cfm?vn=282080',
  },
  312090: {
    vn: 312090,
    displayName: 'Aniakchak Caldera',
    country: 'United States', lat: 56.88, lon: -158.17,
    classification: 'large-caldera-candidate',
    evidence: 'Caldeira de aproximadamente 10 km na Península do Alasca, formada por grande erupção explosiva há cerca de 3.400 anos. O USGS cita Aniakchak entre exemplos de grandes caldeiras do Alasca que podem integrar a classe ampla de sistemas candidatos; não é apresentada aqui como VEI 8 comprovado.',
    sourceLabel: 'Smithsonian GVP — Aniakchak; USGS — examples of large caldera systems',
    sourceUrl: 'https://volcano.si.edu/volcano.cfm?vn=312090',
  },
  211010: {
    vn: 211010,
    displayName: 'Campi Flegrei',
    country: 'Italy', lat: 40.827, lon: 14.139,
    classification: 'large-caldera-system',
    evidence: 'Caldeira ativa de aproximadamente 13 km que inclui parte da área de Nápoles. É destacada como grande sistema de caldeira e não como supererupção VEI 8 confirmada.',
    sourceLabel: 'Smithsonian GVP — Campi Flegrei',
    sourceUrl: 'https://volcano.si.edu/volcano.cfm?vn=211010',
  },
};

export const SUPER_VOLCANO_IDS = new Set<number>(Object.keys(SUPER_VOLCANOES).map(Number));

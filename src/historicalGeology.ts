/** Estruturas/regiões de vulcanismo antigo para representação no mapa.
 * Não são vulcões ativos nem fazem parte do catálogo operacional GVP.
 * Coordenadas regionais são pontos de referência, não limites/crateras precisos.
 */
export interface HistoricalGeologyFeature {
  id: string; name: string; region: string; country: string; aliases?: string[];
  lat: number; lon: number; age: string; geology: string;
  note: string; locationNote: string; sourceName: string; sourceUrl: string;
}

export const HISTORICAL_GEOLOGY: HistoricalGeologyFeature[] = [
  {
    id: 'mendanha', name: 'Complexo Alcalino do Mendanha',
    region: 'Nova Iguaçu / Região Metropolitana do Rio de Janeiro', country: 'Brazil',
    aliases: ['Vulcão de Nova Iguaçu', 'Serra do Vulcão', 'Maciço do Mendanha'],
    lat: -22.80, lon: -43.53,
    age: 'aprox. 72–56 milhões de anos (datações publicadas do complexo)',
    geology: 'Complexo alcalino com corpos plutônicos, hipabissais e subvulcânicos',
    note: 'Estrutura magmática muito antiga, popularmente associada ao nome “Vulcão de Nova Iguaçu”. A interpretação de que exista um cone ou uma cratera vulcânica preservada é controversa; estudo de 2007 concluiu que as feições examinadas correspondem a corpos e condutos subvulcânicos e a uma morfologia erosiva.',
    locationNote: 'Ponto aproximado de referência do Maciço do Mendanha; não representa um cone eruptivo confirmado.',
    sourceName: 'Revista Escola de Minas / SciELO (2007)',
    sourceUrl: 'https://www.scielo.br/j/rem/a/PNVBdDPYQKmLsg4BKSrr7Qm/?lang=pt',
  },
  {
    id: 'alta-floresta-paleocaldera', name: 'Paleocaldeira proposta — Província Mineral de Alta Floresta',
    region: 'Entorno de União do Norte, Peixoto de Azevedo / Mato Grosso', country: 'Brazil',
    aliases: ['Vulcão da Amazônia', 'Caldeira de Alta Floresta', 'Paleocaldeira de Alta Floresta'],
    lat: -10.42851, lon: -54.44989,
    age: 'Contexto vulcânico regional: cerca de 2,0–1,78 bilhões de anos; idade específica da estrutura não definida',
    geology: 'Hipótese de antiga caldeira vulcânica erodida em investigação',
    note: 'Pesquisa divulgada pela Unicamp identificou feições de relevo e rochas compatíveis com uma antiga caldeira erodida na porção leste da Província Mineral de Alta Floresta. Os autores ressaltam que ainda são necessárias análises adicionais; a hipótese não deve ser tratada como uma caldeira delimitada e definitivamente comprovada.',
    locationNote: 'Marcador aproximado na localidade de União do Norte, citada como área de mapeamento; não indica o centro nem o limite exato da hipótese de caldeira.',
    sourceName: 'Unicamp — Pesquisa desvenda passado vulcânico da Amazônia (2024)',
    sourceUrl: 'https://portal.ige.unicamp.br/news/2024-01/pesquisa-desvenda-passado-vulcanico-da-amazonia',
  },
  {
    id: 'uatuma-tapajos', name: 'Caldeiras paleoproterozoicas — Província Uatumã / Tapajós',
    region: 'Província Mineral do Tapajós / Pará e sul da Amazônia', country: 'Brazil',
    aliases: ['Vulcanismo Uatumã', 'Caldeiras do Tapajós', 'Província Uatumã'],
    lat: -6.9, lon: -55.5,
    age: 'aprox. 1,88 bilhão de anos',
    geology: 'Região de vulcanismo félsico paleoproterozoico com múltiplas caldeiras preservadas',
    note: 'Trabalho do Serviço Geológico do Brasil descreve várias caldeiras associadas ao vulcanismo Uatumã preservadas na Província Mineral do Tapajós, preenchidas por depósitos vulcânicos e piroclásticos. Este registro representa a região e o evento geológico, não um único cone vulcânico.',
    locationNote: 'Ponto regional aproximado para a Província Mineral do Tapajós; não é o centro georreferenciado de uma caldeira específica.',
    sourceName: 'Serviço Geológico do Brasil — Uatumã SLIP (2025)',
    sourceUrl: 'https://rigeo.sgb.gov.br/bitstream/doc/25583/1/vasquez_resumo_9svaa_2025.pdf',
  },
  {
    id: 'pocos-de-caldas', name: 'Complexo Alcalino de Poços de Caldas',
    region: 'Poços de Caldas / Minas Gerais', country: 'Brazil',
    aliases: ['Caldeira de Poços de Caldas'],
    lat: -21.787, lon: -46.561,
    age: 'Mesozoico (complexo alcalino)',
    geology: 'Complexo vulcânico-plutônico circular com evolução associada à subsidência de caldeira',
    note: 'Complexo alcalino de forma aproximadamente circular, com cerca de 33 km de diâmetro, incluindo rochas vulcânicas e plutônicas. Estudos descrevem vulcanismo inicial seguido por subsidência de caldeira e intrusões.',
    locationNote: 'Ponto aproximado de referência no município; representa o complexo regional, não uma boca eruptiva.',
    sourceName: 'Schorscher & Shea — Geologia regional do Complexo Alcalino de Poços de Caldas',
    sourceUrl: 'https://www.sciencedirect.com/science/article/pii/037567429290121N',
  },
  {
    id: 'fernando-de-noronha', name: 'Complexo Vulcânico de Fernando de Noronha',
    region: 'Arquipélago de Fernando de Noronha / Pernambuco', country: 'Brazil',
    aliases: ['Vulcão de Fernando de Noronha', 'Formação Remédios', 'Formação Quixaba'],
    lat: -3.854, lon: -32.424,
    age: 'episódios vulcânicos aprox. 12,3–8 Ma e 3–1,7 Ma',
    geology: 'Edifício vulcânico insular com formações piroclásticas, derrames e intrusões',
    note: 'Complexo de origem vulcânica formado por episódios sucessivos separados por erosão. É uma estrutura geológica antiga e sem erupção atual confirmada.',
    locationNote: 'Ponto de referência aproximado na ilha principal; a estrutura vulcânica se prolonga abaixo do nível do mar.',
    sourceName: 'Serviço Geológico do Brasil — Geodiversidade de Fernando de Noronha',
    sourceUrl: 'https://rigeo.sgb.gov.br/server/api/core/bitstreams/3ef68350-50d6-468b-ae95-d512f3c509a4/content',
  },
];

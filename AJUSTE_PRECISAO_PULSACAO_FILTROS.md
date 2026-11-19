# Ajuste de precisão, filtros e animação do GeoGus

## Marcadores e pulsação

- Os símbolos Leaflet de vulcões e terremotos foram discretamente reduzidos: vulcões entre 16–21 px no pictograma, terremotos entre 16–23 px.
- O fundo/medalhão circular permanece removido; o símbolo fica diretamente sobre o mapa.
- A pulsação foi suavizada e reduzida. Continua aplicada ao próprio SVG, sem anéis externos.
- Terremotos pulsam somente se o horário de ocorrência estiver dentro das últimas 24 horas.
- Vulcões pulsam somente quando a data/hora da evidência que justificou o nível de risco estiver dentro das últimas 24 horas.
- Um nível de risco pode continuar colorido (inclusive vermelho) sem continuar pulsando depois de 24 horas: cor representa o estado do último dado recebido; pulsação representa recência.
- O timer local agenda a retirada da pulsação no limite de 24 h sem depender de um novo carregamento da página.

## Filtros sísmicos

- Última 1 hora, últimas 12 horas, últimas 24 horas, 7 dias e 30 dias.
- O backend recorta os eventos por timestamp UTC exato e mantém cache separado por período/magnitude.
- O feed USGS `past hour` é usado na janela de 1 h; o feed `past day` serve de origem para 12 h e 24 h, com corte final exato no backend.

## Classificação vermelha mais estrita

O vermelho é reservado a evidência forte e confirmada: PHIVOLCS nível 5; PVMBG nível IV/AWAS; código de cinzas USGS RED; coluna/pluma de cinzas de pelo menos 6 km em boletim oficial com evidência de erupção; fluxo piroclástico descrito como observado/ocorrido; perigo de solo severo; ou descrição explícita de erupção explosiva major/violenta/paroxística em relatório oficial confirmado. Erupção contínua GVP com VEI máximo do episódio atual >= 4 também recebe vermelho.

USGS WARNING + ORANGE permanece laranja, pois o código de alerta do solo é diferente do código de cinzas para aviação. PHIVOLCS nível 4 e PVMBG nível III permanecem laranja. Erupção moderada confirmada fica laranja.

## Proteções de precisão

- Um terremoto isolado perto do vulcão não altera a cor. A elevação sísmica exige aumento mensurável da frequência ou um agrupamento de eventos rasos/próximos; o nível laranja exige um enxame mais denso e em crescimento.
- A interpretação da altura da coluna/pluma distingue altitude vertical de distância horizontal de dispersão; `drifted 12 km downwind` não se torna uma coluna de 12 km.
- Unidades em metros e pés são convertidas para km, com agrupamento de milhares e separador decimal tratados separadamente.
- Fluxo piroclástico requer verbo/descrição de ocorrência e textos explicitamente negados não disparam vermelho.
- Horários de coleta do endpoint não são usados como horário do evento. Boletins sem data interpretável não geram pulsação artificial.
- O timestamp `sentUtc` do USGS preserva timezone quando fornecido e assume UTC somente quando o campo é ingênuo/sem fuso.
- Notícias podem, no máximo, apoiar amarelo de baixa confiança; horário de publicação jornalística não ativa pulsação.

## Limitações dos dados

A precisão do sistema é limitada pela cobertura, latência, precisão temporal e formato das fontes públicas. Catálogos globais de terremotos não substituem redes sísmicas locais de vulcões: tremor harmônico, eventos de baixa magnitude e microssismicidade podem não constar nesses catálogos. Alguns boletins oficiais fornecem apenas a data do boletim, sem horário; nesses casos a pulsação respeita a precisão temporal publicada, sem inventar uma hora. A cor do GeoGus é uma classificação operacional combinada e não substitui o nível oficial nem o laudo do observatório.

## Testes

Executar `npm run test:precisao` para testar níveis oficiais, evidências RED, guardas contra textos negados, limites temporais, interpretação da altura da pluma e ingestão sísmica multiorigem.

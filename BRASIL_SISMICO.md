# GeoGus — central sísmica multiorigem

## Objetivo

O endpoint `GET /api/earthquakes?period=day|week|month&minMag=1` agrega catálogos de eventos e boletins que publicam parâmetros de terremotos. Cada fonte é consultada de forma independente, com timeout, cache por instituição, reaproveitamento de requisições simultâneas, fallback para dados em cache e deduplicação espaço-temporal.

## Catálogos e boletins consultados automaticamente

| Fonte | Endpoint / produto | Natureza | Cadência de cache | Observação |
|---|---|---|---:|---|
| USGS ComCat | GeoJSON summary feeds | Catálogo global | 60 s | Feed rápido para terremotos recentes. |
| USGS FDSN Event | `https://earthquake.usgs.gov/fdsnws/event/1/query` | Consulta regional do mesmo ComCat | 2 min | Segunda via de consulta para a caixa geográfica brasileira; não é um catálogo independente. |
| USP / BRASIS | `https://www.moho.iag.usp.br/fdsnws/event/1/query` | FDSN Event / QuakeML | 90 s | Catálogo dinâmico; eventos recentes podem ser automáticos e depois revisados. |
| LabSis / UFRN | `https://labsis.ufrn.br/boletins` | Boletim HTML estruturado | 5 min | Publica eventos do Nordeste, incluindo coordenadas, magnitude e hora UTC; magnitudes com `*` são preliminares. |
| SIS-UnB / Obsis | `https://obsis.unb.br/portalsis/?pg=bulletin` | Boletim HTML, coleta best-effort | 10 min | Só gera evento quando encontra tabela com cabeçalhos explícitos de data, hora, magnitude, latitude e longitude. Se a página mudar, bloquear ou não expor a tabela, a fonte fica sinalizada como indisponível/sem linhas interpretáveis. |
| SISBRA preliminar / USP | `https://sismo.iag.usp.br/boletim/boletim2001p.txt` | Boletim nacional preliminar em texto | 15 min | Contém contribuições de diversas instituições, entre elas USP, UnB, UFRN e ON. Não é uma segunda observação independente quando já há o evento original; a deduplicação retém as proveniências. Categorias duvidosas/repetidas são descartadas. |
| EMSC SeismicPortal | `https://www.seismicportal.eu/fdsnws/event/1/query` | FDSN Event / GeoJSON | 2 min | Catálogo global. A integração usa polling HTTP, não WebSocket persistente. |
| GFZ / GEOFON | `https://geofon.gfz.de/fdsnws/event/1/query` | FDSN Event / QuakeML | 5 min | Catálogo de eventos global; consultas limitadas por região e período. |
| ISC | `https://isc.ac.uk/fdsnws/event/1/query` | FDSN Event / QuakeML | 60 min | Catálogo mundial com revisão posterior; não é a fonte mais rápida para eventos recém-ocorridos. |

## Descoberta automática de boletins NES / Unimontes

A página oficial do Núcleo de Estudos Sismológicos (NES/Unimontes) é consultada periodicamente:

- `https://unimontes.br/projetos-e-servicos/nucleo-de-estudos-sismologicos-nes/`
- RSS de busca: `https://unimontes.br/?s=sismologia&feed=rss2`

O conector descobre automaticamente links de boletins PDF e registra seus endereços e títulos em `coverage.bulletinDiscovery` e `coverage.historicalArchives`. Tabelas HTML/RSS só geram epicentros se publicarem explicitamente data, hora, magnitude e coordenadas.

**Limitação explícita:** os boletins mensais publicados como PDF não são convertidos em eventos nesta versão. Não há endpoint de catálogo FDSN documentado para o NES e a extração automática dos PDFs ainda não está implementada. Os boletins distinguem sismos naturais de detonações artificiais; por isso não se deve transformar todo registro do PDF em terremoto natural sem classificar a tabela e a origem. O PDF arquivado deve ser exibido como documento, não como feed em tempo real.

## Infraestrutura que não é catálogo de eventos

A RSBR reúne as redes permanentes das instituições brasileiras (USP, UnB, UFRN e Observatório Nacional). O registro FDSN da RSBR oferece serviços `fdsnws-station` (metadados de estações) e `fdsnws-dataselect` (formas de onda), não `fdsnws-event`. O portal do Centro de Sismologia da USP também descreve SeedLink para formas de onda em tempo real. Esses serviços não podem ser convertidos em marcadores de terremoto apenas consultando metadados ou waveform: isso exigiria processamento sismológico contínuo (detecção de fases, associação e localização hipocentral), fora do escopo de uma função serverless Vercel.

- RSBR: `https://rsbr.on.br/`
- RSBR FDSN Station: `https://rsbr.iag.usp.br/fdsnws/station/1/`
- ON / RSIS: `https://www.rsis.on.br/`
- USP SeedLink: `seisrequest.iag.usp.br:18000` (protocolo SeedLink, não HTTP event feed)

O portal SIS-UnB pode ser coletado por HTML somente se disponibilizar tabela estruturada. As contribuições do SIS-UnB também podem aparecer no SISBRA preliminar; por isso o nome de uma instituição na lista de colaboradores não deve ser contabilizado automaticamente como outro evento.

## Catálogos e arquivos históricos

- SISBRA consolidado v2024May09: eventos até 31/12/2023; é uma referência estática revisada, não feed atual. Página: `https://sismo.iag.usp.br/eq/bulletin/`.
- NES/Unimontes: boletins mensais PDF e registros históricos; documentos descobertos automaticamente, sem extração PDF nesta versão.
- RISBRA / BDSDR: registros históricos e estudos de sismicidade induzida por reservatórios; sem endpoint público de eventos documentado no material identificado.
- ISC Bulletin: útil para revisão e histórico; parte do catálogo revisado tem defasagem considerável.

## Serviços internacionais aposentados / não utilizados

O serviço FDSN Event da EarthScope/IRIS (`service.iris.edu/fdsnws/event/1/`) foi aposentado em 01/06/2026. O próprio EarthScope aponta USGS/NEIC e ISC como serviços substitutos; por isso o GeoGus não chama esse endpoint aposentado.

## Deduplicação e qualidade

- Um evento pode aparecer em vários catálogos, mas aparece uma vez no mapa.
- A união usa proximidade temporal (até 120 s) e distância epicentral (até 40 km); os IDs e a lista de fontes são preservados na proveniência consolidada.
- A escolha do registro principal prioriza soluções revisadas/manuais; magnitudes e coordenadas ainda podem mudar em catálogos preliminares.
- Eventos automáticos/preliminares permanecem identificados como tais.
- O SISBRA preliminar mantém seus colaboradores; isso não equivale a um novo evento observado independentemente por cada instituição.
- Eventos artificiais/mineração e sismos induzidos devem permanecer identificados como tais e não ser misturados silenciosamente a terremotos naturais.

## Rotas GeoGus

- `GET /api/earthquakes?period=day|week|month&minMag=1`
  - retorna `quakes`, `sources`, `errors`, `coverage`, `brazilCount`, `globalCount`, `stale` e `partial`;
  - cada item de `sources` informa `ok`, `stale`, `cached`, `count`, `endpoint`, `kind`, `coverage` e `cadence`;
  - a descoberta de documentos NES/Unimontes fica em `coverage.bulletinDiscovery.documents`.

## Limites operacionais

- As fontes externas podem responder com timeout, 403, 429 ou formatos alterados. Uma falha não deve impedir que as outras fontes respondam.
- A cadência indicada é a política de cache do GeoGus, não uma promessa de atualização/publicação da instituição.
- Em Vercel Serverless, o cache em memória é oportunista e pode desaparecer entre instâncias frias; para histórico persistente distribuído seria necessário armazenamento durável.
- O endpoint FDSN pode retornar 204 quando não há eventos dentro dos filtros; isso não significa erro.

# GeoGus — integração de sismicidade brasileira

## Fonte operacional integrada

O backend consulta o FDSN Event Web Service do Centro de Sismologia da USP:

- Endpoint: `https://www.moho.iag.usp.br/fdsnws/event/1/query`
- Visualização oficial: `https://moho.iag.usp.br/eq/latest`
- Dados: catálogo paramétrico de eventos, QuakeML/XML por padrão, com filtros de período, magnitude e caixa geográfica.
- Região da consulta: janela geográfica de cobertura do Brasil (`lat -34..6`, `lon -74..-34`). Os eventos são exibidos com atribuição `USP / RSBR`.

O Centro de Sismologia da USP integra a Rede Sismográfica Brasileira (RSBR). A rede é operada por USP, UnB, Observatório Nacional e UFRN, com sub-redes BL/BR, ON/RSIS e NB/RSISNE. O serviço de catálogo da USP também é descrito pela USP como um catálogo dinâmico, com eventos recentes que podem ter localização automática e posterior revisão por sismólogos.

## Complementação global

- USGS ComCat permanece como fonte global primária.
- EMSC SeismicPortal é fallback global quando o USGS falhar.
- Eventos coincidentes USP/RSBR e USGS são deduplicados por proximidade espaço-temporal, mantendo as duas proveniências.

## Interpretação de qualidade

- `Revisado pela USP`: origem QuakeML com `evaluationMode=manual` ou `evaluationStatus=confirmed`.
- `Automático · aguardando revisão`: demais eventos automáticos do catálogo.
- Os eventos automáticos devem ser entendidos como preliminares; localização e magnitude podem mudar após revisão.
- O Boletim Sísmico Brasileiro (BSB/SISBRA) é uma publicação consolidada e estática. A página da USP informa que a versão v2024May09 inclui eventos até 31/12/2023. Por isso, o BSB não é usado como feed de notificações em tempo real.

## Limitações conhecidas

- A USP informa SeedLink para obtenção de formas de onda em tempo real (TCP, porta 18000), mas isso não é um feed HTTP de eventos pronto para o frontend. O GeoGus usa o catálogo FDSN Event da USP, com consulta periódica, em vez de manter um consumidor SeedLink permanente dentro de uma função serverless do Vercel.
- O LabSis/UFRN publica notícias e boletins regionais, incluindo RSS e boletins periódicos. Essas publicações são fontes oficiais complementares, mas não são tratadas como eventos georreferenciados automáticos nesta integração, para não inventar coordenadas ou converter notícia em epicentro sem dado estruturado.
- A consulta da USP usa uma caixa geográfica ampla para cobrir o Brasil; o catálogo pode incluir eventos próximos às fronteiras na área da consulta.

## Rotas GeoGus

- `GET /api/earthquakes?period=day|week|month&minMag=1`
  - combina USGS/EMSC global com USP/RSBR Brasil;
  - retorna `sources`, `globalCount`, `brazilCount`, `quakes`, erros parciais e status de cache.

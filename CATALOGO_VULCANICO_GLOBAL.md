# GeoGus — catálogo vulcânico mundial e alertas

## Cobertura do mapa

O GeoGus utiliza as camadas oficiais do Smithsonian Global Volcanism Program (GVP) para representar a cobertura Quaternária publicada no catálogo Volcanoes of the World:

- **Holoceno:** 1.214 vulcões na edição GVP v5.4.0, publicada em 07/08/2026. Esses registros correspondem a vulcões com erupções durante o Holoceno (aproximadamente os últimos 12 mil anos).
- **Pleistoceno:** 1.452 registros na lista Pleistoceno da mesma base. O próprio GVP descreve essa lista como preliminar; pode conter dados incompletos ou incorretos.

As duas camadas totalizam aproximadamente 2.666 entradas antes de deduplicação e da exclusão de registros sem coordenadas utilizáveis. A interface mostra a contagem efetivamente carregada. Isso deve ser descrito como todo o catálogo Quaternário do GVP disponível ao aplicativo, não como todos os edifícios vulcânicos de qualquer idade geológica do planeta.

### Camadas

1. **Holoceno:** pins coloridos segundo estado operacional; somente erupções confirmadas em andamento pulsam.
2. **Pleistoceno:** pins violeta em camada cluster própria; nunca são classificados como erupções atuais.
3. **Supervulcões/grandes caldeiras:** pins especiais para Yellowstone, Long Valley, Valles Caldera, Toba e Taupo, sem duplicar o pin normal de catálogo.
4. **Estruturas geológicas pré-Quaternárias:** camada local separada, desligada por padrão (ex.: Mendanha e estruturas brasileiras antigas).

O filtro inicial é global (`country=''`, status `all`), e as camadas Holoceno, Pleistoceno e supervulcões são ativadas por padrão. O usuário pode desligar cada camada individualmente.

Em escala mundial, o Leaflet MarkerCluster agrupa pins para manter desempenho. Ao ampliar o mapa, os grupos se dividem e os registros individuais tornam-se selecionáveis.

## Supervulcões

O destaque inclui cinco sistemas citados pelo USGS como exemplos de grandes caldeiras/centros associados a supererupções: Yellowstone, Long Valley, Valles Caldera, Toba e Taupo. O USGS descreve uma supererupção como VEI 8, com mais de 1.000 km³ de material ejetado. "Supervulcão" não é uma categoria taxonômica universal e o marcador descreve somente o histórico geológico; não significa alerta, atividade atual ou risco iminente.

## Alertas vulcânicos

O frontend verifica fontes oficiais a cada 60 segundos:

- Smithsonian GVP WFS — erupções marcadas como contínuas (`ContinuingEruption`).
- USGS HANS — vulcões monitorados, alertas elevados e notices.
- PHIVOLCS — níveis e boletins das Filipinas.
- PVMBG/MAGMA — níveis e relatórios da Indonésia.
- Central de relatórios oficiais já configurada no projeto — relatórios diários/semanais quando disponíveis.

O cache de servidor para HANS/PHIVOLCS/PVMBG e o cache GVP de erupções contínuas são de 45 segundos. Em falhas transitórias, o GeoGus mantém o último dado válido e identifica a condição de cache/erro.

**Limite de tempo real:** polling de um minuto não garante alerta instantâneo. A aplicação só pode informar depois que o observatório publica ou disponibiliza o evento. Algumas fontes publicam boletins diários ou em intervalos irregulares; indisponibilidade ou bloqueio pelo provedor pode atrasar a atualização. Alertas de nível elevado não são automaticamente convertidos em erupção.

## Fontes oficiais

- Smithsonian GVP Holocene Volcano List: https://volcano.si.edu/volcanolist_holocene.cfm
- Smithsonian GVP Pleistocene Volcano List: https://volcano.si.edu/volcanolist_pleistocene.cfm
- Smithsonian GVP WFS: https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs
- Informações dos webservices: https://a.cf11.si.edu/database/webservices.cfm
- USGS HANS Volcano API: https://volcanoes.usgs.gov/hans-public/api/volcano/
- USGS HANS Notice API: https://volcanoes.usgs.gov/hans-public/api/notice/
- PHIVOLCS: https://wovodat.phivolcs.dost.gov.ph/
- PHIVOLCS LAVA-DOME: https://volcano.phivolcs.dost.gov.ph/
- PVMBG/MAGMA: https://magma.esdm.go.id/
- SERNAGEOMIN RNVV (referência de cobertura, ainda não conectado neste conector): https://rnvv.sernageomin.cl/rnvv

## Deploy

A API GVP está em `api/gvp.mjs`; em local, Vite faz proxy `/api/*` para o servidor Node. No Vercel, as funções da pasta `api/` precisam estar no mesmo repositório/raiz do projeto. O build e as consultas externas devem ser testados após `npm ci` e `npm run build`.

## Atualização de 17/11/2026 — cobertura global e supervulcões

- `loadVolcanoCatalog()` e `loadPleistoceneCatalog()` usam agora paginação WFS 2.0 quando `numberMatched` excede o tamanho da primeira página, até um teto defensivo de 20.000 registros por camada.
- A camada Pleistoceno é solicitada independentemente do sucesso inicial do catálogo Holoceno. Uma falha numa das duas camadas não bloqueia a tentativa da outra.
- `MapView` inclui na assinatura do marcador os campos de nome, país, tipo, elevação e metadados da imagem, além de coordenadas/status/alerta. Quando a ficha do catálogo for atualizada, popup e marcador são reconstruídos com os dados novos.
- O conjunto destacado passou a mostrar oito sistemas: quatro centros citados pelo USGS entre os exemplos de supervulcões/supererupções (Yellowstone, Long Valley, Toba e Taupo), duas grandes caldeiras destacadas sem afirmar VEI 8 confirmado (Valles e Campi Flegrei) e duas grandes caldeiras candidatas/de interesse (Aira e Aniakchak). A terminologia é explicitada em cada popup; não há classificação universal única de supervulcão.
- Os oito marcadores especiais têm coordenadas curadas como fallback quando o GVP ainda não retornou o catálogo; quando a ficha GVP existe, ela prevalece. Isso evita que os pins de destaque desapareçam somente porque o endpoint GVP falhou.
- O mapa segue mostrando o catálogo Quaternário GVP (Holoceno + Pleistoceno) em camadas separadas e agrupadas. À escala mundial, os marcadores ficam agrupados; ao aproximar, os pins individuais aparecem. A lista Pleistoceno permanece preliminar segundo o próprio GVP.
- Alertas vulcânicos seguem com polling de 60 s nos conectores já implementados (GVP WFS, USGS HANS, PHIVOLCS e PVMBG). O polling é de quase tempo real, condicionado à publicação e disponibilidade de cada observatório; não é um feed instantâneo universal.

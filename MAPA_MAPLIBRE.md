# GeoGus — mapa híbrido MapLibre + Leaflet

## Arquitetura atual

O GeoGus usa um mapa híbrido para combinar uma base cartográfica vetorial moderna com a identidade visual e os recursos de marcação originais:

- **MapLibre GL JS 6.19.0** renderiza o mapa-base vetorial escuro (OpenFreeMap) com WebGL.
- **Leaflet 1.9.4** permanece como mapa principal e desenha todos os elementos operacionais: ícones SVG/DivIcon, marcadores, círculos, clusters, popups, controles e animações.
- **`@maplibre/maplibre-gl-leaflet` 0.1.4** integra a base MapLibre como uma camada Leaflet.
- **`leaflet.markercluster`** mantém o agrupamento dos terremotos e dos grupos de vulcões já clusterizados.
- As animações CSS originais do GeoGus foram preservadas: verde estático; amarelo, laranja e vermelho pulsando conforme o nível calculado.

## O que permanece Leaflet

- Ícone de vulcão e halo de risco (verde/amarelo/laranja/vermelho).
- Ícone de terremoto proporcional à magnitude e pulsação para eventos recentes ou acima do limite.
- Clusters sísmicos com contagem, cor pela maior magnitude e expansão/spiderfy.
- Marcadores de Pleistoceno, supervulcões e estruturas geológicas históricas.
- Popups com detalhes, fotos e ação para abrir os detalhes completos.
- Círculo temporário de foco, controles de zoom, eventos de clique e interações das camadas.

## Base cartográfica

- Estilo vetorial padrão: `https://tiles.openfreemap.org/styles/dark`.
- A atribuição exibida é OpenFreeMap e OpenStreetMap contributors.
- Se o estilo inicial não carregar em 16 segundos ou o WebGL falhar na inicialização, usa-se o raster escuro da Esri como fallback. Os marcadores e interações Leaflet permanecem disponíveis.

## Limitações do adaptador híbrido

A documentação do adaptador informa que esta integração não oferece rotação/bearing ou inclinação/pitch. Também alerta que o canvas MapLibre é sincronizado pelos eventos e gestos do Leaflet e pode parecer mais lento durante pan/zoom do que um mapa MapLibre puro. A escolha foi feita para manter os ícones, marcadores, popups e animações Leaflet exatamente como solicitado, sem redesenhar a interface do GeoGus.

## Dependências e instalação

Dependências diretas: `leaflet`, `leaflet.markercluster`, `maplibre-gl` 6.19.0 e `@maplibre/maplibre-gl-leaflet` 0.1.4. O worker do MapLibre é empacotado pelo Vite via `?worker&url`.

```bash
npm install
npm run build
```

## Verificação após publicar

No desktop e no iPhone, testar pan/zoom, rolagem, grupos de terremotos, ícones pulsantes, popups, painel lateral, legenda minimizável e mudança de orientação do aparelho.

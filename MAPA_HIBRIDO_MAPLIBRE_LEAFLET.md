# Mapa híbrido GeoGus — MapLibre + Leaflet

## Arquitetura

- MapLibre GL JS (WebGL) renderiza somente o mapa-base vetorial escuro do OpenFreeMap.
- O adaptador oficial `@maplibre/maplibre-gl-leaflet` incorpora o canvas MapLibre como camada do mapa Leaflet.
- Leaflet continua sendo o mapa interativo e desenha os marcadores, ícones SVG/DivIcon, círculos, popups, clusters e controles.
- `leaflet.markercluster` permanece responsável pelo agrupamento sísmico e pelos grupos de vulcões que já usam cluster.
- As classes CSS existentes do GeoGus são mantidas para a pulsação amarela/laranja/vermelha. Marcadores verdes permanecem estáticos.

## Dependências

`leaflet`, `leaflet.markercluster`, `maplibre-gl` 6.19.0 e `@maplibre/maplibre-gl-leaflet` 0.1.4. O worker MapLibre é resolvido pelo Vite com `?worker&url`.

## Limitações importantes

O adaptador usa os eventos e gestos do Leaflet para sincronizar a câmera MapLibre. A documentação do adaptador informa que esta combinação não oferece pitch/rotação e pode parecer mais lenta que um mapa MapLibre puro durante pan/zoom; a vantagem é recuperar integralmente a compatibilidade com ícones, marcadores, popups e plugins Leaflet. Para esse requisito do GeoGus, os recursos visuais Leaflet foram priorizados sobre os recursos de rotação/3D do mapa puro.

A base vetorial usa OpenFreeMap sem token. Se o estilo inicial não carregar dentro de 16 segundos ou WebGL não inicializar, o GeoGus usa o raster escuro Esri como fallback; os marcadores Leaflet continuam em funcionamento.

## Instalação

```bash
npm install
npm run build
```

Em dispositivo móvel, validar zoom, pan, abrir/fechar popups, agrupamento, painéis e redimensionamento/rotação do aparelho.

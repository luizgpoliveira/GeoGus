# GeoGus — navegação horizontal contínua

- Removidos `maxBounds` e `maxBoundsViscosity`, que prendiam o arraste entre -180° e +180°.
- `worldCopyJump: true` no Leaflet permite atravessar a linha internacional de data sem perder marcadores e overlays.
- `setRenderWorldCopies(true)` no mapa MapLibre garante repetição horizontal do mapa-base vetorial.
- Limites naturais de latitude da projeção Web Mercator continuam valendo; a navegação horizontal não fica limitada.

# GeoGus — marcadores Leaflet no mapa-base MapLibre

## Objetivo

O MapLibre continua renderizando exclusivamente a base cartográfica vetorial/WebGL. Toda a simbologia geográfica do GeoGus permanece no Leaflet: `L.marker`, `L.divIcon`, `leaflet.markercluster`, círculos de foco e pop-ups.

## Alterações visuais

- Vulcões operacionais ampliados: 34 px (verde), 40 px (amarelo), 44 px (laranja) e 48 px (vermelho), com espaço adicional para as ondas de pulso.
- Verde permanece estático; amarelo pulsa lentamente, laranja em frequência intermediária e vermelho com pulsação forte e brilho mais intenso.
- Terremotos usam um marcador Leaflet circular com símbolo sísmico/raio e ondas, dimensionado por magnitude (26–44 px), com animação mais forte para magnitudes elevadas e eventos acima do limite de alerta.
- Clusters de terremotos e vulcões foram ampliados e receberam símbolos/cores próprios. Um cluster vulcânico herda a maior classe de risco dos marcadores contidos e mostra quantos possuem atividade.
- Marcadores de supervulcões, Pleistoceno e estruturas geológicas históricas também foram ampliados e receberam melhor contraste.
- Hover/foco melhora o contraste sem alterar o posicionamento calculado pelo Leaflet.
- `prefers-reduced-motion` desativa os efeitos animados sem reduzir a opacidade dos marcadores.
- Cache do PWA atualizado para `v12` para forçar a substituição dos estilos antigos em instalações existentes.

## Desempenho

Os ícones continuam sendo DOM do Leaflet porque a solicitação é preservar a simbologia e as animações originais do Leaflet no mapa-base MapLibre. Para evitar sobrecarga, eventos sísmicos continuam agrupados em zooms menores e os grupos usam carregamento em blocos. A animação é limitada aos eventos recentes/alertas e aos vulcões com nível operacional acima de verde.

## Observação

O tamanho dos marcadores é fixo em pixels CSS e permanece legível em diferentes níveis de zoom. Como o número de marcadores mundiais é elevado, os clusters se tornam mais importantes em zoom global.

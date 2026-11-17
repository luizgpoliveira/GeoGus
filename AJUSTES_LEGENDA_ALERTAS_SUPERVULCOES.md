# GeoGus — ajustes de mapa, legenda e alertas

## Implementado nesta versão
- Legenda do mapa recolhível/expansível pelo próprio cabeçalho, com estado inicial compacto em telas de até 900 px e aberta em desktop.
- Legenda disponível também em dispositivos móveis, posicionada acima da barra inferior de filtros.
- Inclusão de símbolo explicativo para terremotos que atingem ou superam o limite de alerta configurado.
- Resumo no mapa, atualizado conforme os dados carregados, com contagem de terremotos acima do limite de magnitude e boletins vulcânicos recebidos.
- Mantida a camada independente de supervulcões/grandes caldeiras, com controle `showSupervolcanoes`, catálogo curado, marcadores destacados e popups com ressalva científica sobre a classificação.
- Mantidos os recursos existentes do GeoGus, incluindo fontes, histórico, catálogo e carrossel da atividade vulcânica.

## Limites e precisão
- A classificação “supervulcão” não é uma categoria formal universal do Smithsonian GVP. O catálogo distingue supererupções documentadas, grandes sistemas de caldeira e candidatos, sem sugerir risco iminente.
- A contagem de alertas no mapa reflete os registros recebidos pelas fontes integradas e o limite de magnitude configurado; não representa previsão de terremotos.

## Validação
- Arquivo TSX de `MapView.tsx` validado por transpilation TypeScript sem erros de sintaxe.
- O build completo (`npm run build`) não pôde ser concluído neste ambiente porque a instalação de dependências foi interrompida por timeout e o cache npm não continha todos os pacotes. Executar `npm ci` e `npm run build` localmente antes do deploy.

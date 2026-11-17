# GeoGus — ajustes de legenda, pulsação, notificações e período padrão

## Alterações
- Legenda do mapa recolhível/expansível, com preferência persistida no navegador. Em dispositivos móveis, inicia recolhida quando ainda não existe preferência salva.
- Pulsação em anéis nos vulcões em erupção confirmada, atividade recente e vulcões ativos, com velocidades distintas.
- Terremotos das últimas 24 horas e terremotos acima do limite de alerta recebem pulsação; agrupamentos sísmicos também destacam os eventos recentes e magnitudes altas.
- Supervulcões/grandes caldeiras recebem destaque pulsante dourado, distinto dos marcadores de alerta.
- Alertas novos também aparecem em um toast dentro do mapa, mesmo sem permissão de notificações do sistema; o toast abre a Central de Notificações.
- A primeira consulta sísmica preenche a Central de Notificações com terremotos relevantes encontrados na janela de 24 horas, sem disparar pop-ups do sistema no carregamento inicial.
- A primeira coleta de observatórios apresenta erupções atuais e boletins associados na Central, também sem disparo retroativo do sistema. Eventos novos continuam seguindo as configurações e a permissão de notificações do navegador.
- Período inicial alterado para 24 horas no frontend e nos endpoints/backend. Uma migração única corrige instalações antigas para 24 h na próxima abertura; depois o período escolhido pelo usuário é preservado.

## Notas
As notificações do navegador continuam dependendo da permissão concedida pelo usuário e da opção correspondente nas configurações. A Central de Notificações interna é preenchida independentemente dessa permissão. Animações respeitam `prefers-reduced-motion`.

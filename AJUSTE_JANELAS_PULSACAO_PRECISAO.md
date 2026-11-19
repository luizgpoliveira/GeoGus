# Ajuste de janelas temporais e pulsação dos marcadores

- Ícones individuais de vulcões e terremotos ficaram menores e sem medalhão/círculo.
- A pulsação foi transferida para o próprio pictograma (brilho/escala), sem anéis circulares.
- Terremotos só pulsam quando o horário de ocorrência está dentro das últimas 24 horas; magnitude e alerta não prolongam a animação.
- Vulcões só pulsam quando a evidência temporal que justificou o nível de risco (boletim oficial, código de alerta, evento sísmico local ou início de episódio eruptivo) tem até 24 horas. A cor de risco permanece mesmo quando a animação expira.
- O mapa agenda a retirada da pulsação do vulcão no momento em que a evidência completa 24 h, sem depender de novo polling.
- Filtros sísmicos: última 1 hora, últimas 12 horas, 24 horas, 7 dias e 30 dias. As janelas de 1 h/12 h são recortadas por timestamp UTC exato no backend.
- O cache sísmico por fonte agora é separado por período e magnitude, para que a troca de filtro não reutilize incorretamente resultados de outra janela.
- Códigos PVMBG textuais NORMAL/WASPADA/SIAGA/AWAS são reconhecidos; AWAS/IV classifica como vermelho. Episódio GVP contínuo com VEI >= 4 também recebe vermelho, mas só quando o GVP identifica o episódio como atualmente contínuo.

## Precisão e limitações

As janelas são calculadas com timestamps dos eventos, em UTC, não por dia civil local. Para os feeds USGS, a janela de 1 h usa o feed próprio Past Hour; a de 12 h usa o feed Past Day como origem e aplica corte exato de 12 h ao resultado agregado. Outras fontes são consultadas por `starttime` sempre que oferecem FDSN. A disponibilidade e a latência dependem do catálogo de origem; a classificação não substitui a avaliação oficial do observatório.

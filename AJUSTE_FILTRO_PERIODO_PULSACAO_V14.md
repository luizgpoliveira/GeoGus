# GeoGus v14 — filtro por camada e pulsação vulcânica

## Barra de filtros
- Período aparece quando Terremotos OU Vulcões está ativado.
- Magnitude mínima aparece somente quando Terremotos está ativado.
- Ao alternar as flags, a barra móvel volta ao início; isso evita que o scroll horizontal deixe o controle Período escondido fora da tela.

## Pulsação vulcânica
- Marcadores amarelos, laranjas e vermelhos usam o mesmo motor `glyphActivityPulse` dos terremotos.
- A pulsação exige risco não verde e evidência com timestamp real nas últimas 24 horas.
- Não há exceção para erupção contínua antiga sem atualização datada: o estado/cor pode continuar, mas a animação expira às 24 horas, conforme o requisito visual.
- Em dispositivos com `prefers-reduced-motion`, a pulsação continua perceptível por brilho/opacidade, sem escala espacial.
- Supervulcões usam a mesma janela temporal.

## Testes
- `npm run test:filters`: Período OR e Magnitude exclusiva de terremotos.
- `npm run test:volcano-pulse`: atividade amarela/laranja/vermelha, expiração de 24 h, tolerância de relógio e casos antigos.
- `npm run test:precisao`: inclui os testes acima.

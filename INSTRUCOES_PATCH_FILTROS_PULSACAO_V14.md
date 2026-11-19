# Aplicação do patch GeoGus v14

1. Faça backup da pasta atual.
2. Extraia o ZIP do patch mantendo os caminhos (`src/`, `public/`, `scripts/`).
3. Substitua os arquivos existentes pelos arquivos do patch.
4. Execute `npm install` se necessário.
5. Execute `npm run test:precisao`.
6. Execute `npm run build` e publique no Vercel.
7. No iPhone, feche o PWA e abra novamente para atualizar o Service Worker v14.

Comportamento esperado:
- Terremotos + Vulcões: Período e Magnitude mínima visíveis.
- Somente Terremotos: Período e Magnitude mínima visíveis.
- Somente Vulcões: somente Período visível.
- Ambos desligados: Período e Magnitude mínima ocultos.
- A barra inferior retorna automaticamente ao começo após alternar as flags.
- Vulcões amarelos/laranjas/vermelhos com evidência datada recente pulsam com o mesmo motor visual dos terremotos.
- Após 24 h sem nova evidência datada, a pulsação desaparece; a cor de risco pode permanecer.

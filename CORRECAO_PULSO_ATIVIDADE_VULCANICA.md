# Correção — pulsação da camada Atividade vulcânica

## O que foi corrigido

- Os marcadores amarelos, laranjas e vermelhos da camada `Atividade vulcânica` usam o mesmo estado `pulse-active` dos eventos sísmicos.
- O mapa consulta o resultado temporal do motor de risco (`risk.pulse`) e valida novamente a data da evidência para impedir pulsos de dados antigos.
- Erupções contínuas ainda abertas pelo Smithsonian GVP permanecem pulsando enquanto a fonte as mantiver em andamento.
- Marcadores verdes e vulcões geologicamente ativos sem evidência recente não pulsam.
- O PVMBG agora associa cada nível de alerta ao boletim oficial mais recente do próprio vulcão. A data do boletim é usada como `noticeTime`; o horário de coleta/cache da API nunca é usado como se fosse a data do fenômeno.
- O pulso do pictograma ficou mais perceptível. Em dispositivos configurados para movimento reduzido, permanece um pulso suave de brilho/opacidade, sem deslocamento do ícone.

## Regra temporal

Sinais pontuais pulsam por até 24 horas após a evidência datada. Depois desse período, o ícone mantém a cor de risco, mas deixa de pulsar. Episódios eruptivos contínuos oficialmente abertos permanecem pulsando.

## Arquivos alterados

- `src/api.ts`
- `src/components/MapView.tsx`
- `src/styles.css`
- `src/volcanoPulse.ts` (novo)
- `scripts/test-volcano-map-pulse.mjs` (novo)
- `package.json`

## Testes

Executar `npm run test:precisao`. A suíte inclui os testes de risco, filtros temporais, filtros visuais, interpretação dos boletins, ingestão sísmica e 12 verificações específicas para pulsação e associação de boletins PVMBG.

A compilação frontend (`npm run build`) requer as dependências npm instaladas. No ambiente de preparação desta correção, `react` e os tipos React não estavam instalados; por isso a compilação completa não pôde ser validada aqui.

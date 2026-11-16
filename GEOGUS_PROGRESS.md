# GeoGus — progresso de implementação

Este arquivo registra o estado da entrega para permitir retomada em outra sessão sem reanalisar todo o projeto.

## Arquitetura preservada

- Frontend: React 18 + TypeScript + Vite.
- Mapa: Leaflet e marker cluster existentes.
- Backend: servidor Node em `server/server.mjs` e coletor em `server/reports.mjs`.
- Persistência dos relatórios: `server/data/reports.json`.
- Não houve troca de framework, renomeação do app ou reconstrução da arquitetura.

## Implementado nesta alteração

1. Galeria da seção `ATIVIDADE VULCÂNICA NO MOMENTO` convertida em carrossel horizontal com setas discretas, sem quebra de linha.
2. Navegação por rolagem horizontal nativa, compatível com toque/arraste em dispositivos móveis.
3. Setas são desabilitadas quando não existe conteúdo naquela direção; o estado é recalculado ao rolar e redimensionar.
4. Cinco cards são exibidos em telas largas; o número se adapta em larguras menores.
5. Cards continuam usando os dados e componentes existentes. `LOCALIZAR NO MAPA` mantém o callback atual. `SAIBA MAIS` abre o painel de detalhes existente.
6. Cards da área de atividade não são alimentados por boletins BGVN antigos: a galeria considera apenas itens dos últimos sete dias. Os boletins mais antigos continuam acessíveis em `ATUALIZAÇÕES`/histórico.
7. A atividade usada para marcar vulcões no mapa permanece limitada a 48 horas.
8. Coleta GVP ampliada para relatório semanal completo, RSS semanal, relatório diário e boletins BGVN. O boletim BGVN usa a página oficial `reports_bgvn.cfm` e parser próprio para seu HTML (os relatórios usam cabeçalhos internos h3/h4 dentro de cada artigo h5).
9. Categorias novas do tipo `ERUPCAO_RECENTE`, `ERUPCAO` contínua e `INQUIETACAO` aplicadas conforme o tipo de relatório GVP, sem converter todo nível de alerta em erupção.
10. Extração de altura de cinzas em km ou metros, convertendo metros para km.
11. Intervalos semanais como `5 November-11 November 2026` recebem data final consistente e IDs estáveis para evitar duplicação nas sincronizações.
12. A lista de atualizações foi ampliada para sete dias e inclui boletins BGVN, preservando o panorama principal com janela estrita de 48 horas.
13. O texto enviado ao serviço de IA opcional contém uma amostra maior da narrativa oficial (até 700 caracteres por item). O texto coletado é armazenado no registro, com limite de segurança de 12.000 caracteres por item semanal/diário e 12.000 no boletim.

## Arquivos alterados

- `src/components/Intel.tsx` — carrossel, setas e ação `Saiba mais`.
- `src/App.tsx` — callback para abrir os detalhes do vulcão já existentes.
- `src/styles.css` — layout horizontal, setas, responsividade e categoria de erupção recente. Arquivo mantido em codificação Windows-1252.
- `src/i18n.ts` — rótulos traduzidos das setas, botão e categoria.
- `src/api.ts` — eventos usados na atividade do mapa limitados a 48 horas.
- `server/reports.mjs` — coletores e parsers GVP, janela do panorama e sincronização/deduplicação.

## Validação executada

- `node --check server/reports.mjs` — passou.
- `node --check server/server.mjs` — passou.
- Transpilação sintática de arquivos TS/TSX — passou (sem verificação de tipos completa).
- Teste isolado dos parsers com HTML/RSS de fixture: semanal, RSS, diário e BGVN; os quatro foram reconhecidos e repetição de sincronização não aumentou a quantidade de registros.
- Acessibilidade da página GVP e formato dos relatórios foram confrontados com a estrutura pública do Smithsonian.

## Pendente / limitações conhecidas

1. Não foi possível executar `npm run build` nesta cópia porque o ZIP não contém `node_modules` e o ambiente de inspeção não tinha acesso à rede para instalar dependências. Execute `npm ci` e depois `npm run build` no computador local.
2. A conectividade real do processo Node do seu ambiente com GVP/observatórios deve ser validada após iniciar o servidor; o teste executado usou fixtures, não chamadas externas reais. O servidor pode receber HTTP 403/bloqueio de proteção do GVP. Os status das fontes mostram falhas reais e o RSS semanal é uma rota alternativa.
3. A importação automática de edições semanais anteriores pela aba `vtab=archive` ainda precisa de validação: a página oficial foi confirmada, mas a resposta consultada não expôs blocos históricos completos para parser. O coletor cobre a edição semanal publicada atualmente e o RSS.
4. O CAP não foi integrado: não foi possível confirmar um endpoint CAP GVP utilizável nesta entrega. Não foi criada uma API fictícia.
5. Reuters/AP são consultadas pelo agregador de notícias já existente (Google News), e não por APIs próprias da Reuters/AP.
6. A interpretação por IA depende de `AI_API_URL`, `AI_API_KEY` e opcionalmente `AI_MODEL` no ambiente do servidor. Sem essas variáveis, o sistema usa as regras determinísticas já existentes. Nenhuma chave foi adicionada ao projeto.
7. Esta alteração não adiciona novos observatórios/VAAC além das integrações já presentes.

## Correção adicional — proxy local do Vite

- O proxy `/api/gvp` agora aponta para `http://127.0.0.1:8787`, evitando resolução de `localhost` para IPv6 (`::1`) em ambientes Windows.
- Foi adicionado o script `npm run dev:api` para iniciar explicitamente o backend local.
- Em desenvolvimento, o backend e o Vite precisam ficar ativos em dois terminais separados. `npm start` também inicia o backend.

## Próximos passos locais

1. Fazer backup da pasta atual.
2. Extrair esta versão sobre uma cópia de teste, mantendo o arquivo `server/data/reports.json` do seu projeto caso tenha recebido novos registros desde o ZIP enviado.
3. Executar `npm ci`.
4. Executar `npm run build`.
5. Iniciar o backend com `npm start` e o frontend com `npm run dev` em outro terminal, seguindo o fluxo normal do projeto.
6. Conferir os indicadores de status das fontes e testar setas, `LOCALIZAR NO MAPA` e `SAIBA MAIS`.

## Correção — APIs locais e disponibilidade das fontes (16/11/2026)

1. Corrigido o proxy de desenvolvimento Vite: agora `'/api'` inteiro é encaminhado para `http://127.0.0.1:8787`, incluindo `/api/gvp`, `/api/reports`, `/api/phivolcs` e `/api/pvmbg`. Antes, somente `/api/gvp` era encaminhado; os demais endpoints recebiam o `index.html` do Vite e falhavam ao executar `response.json()` com `Unexpected token '<'`.
2. Adicionado `GET /api/health` para distinguir backend local ativo de falha de acesso às fontes externas.
3. Rotas `/api/*` não reconhecidas agora respondem JSON 404, nunca o HTML da aplicação.
4. O frontend valida `Content-Type` e o corpo antes de interpretar JSON; respostas HTML agora geram erro explícito com instrução sobre backend/proxy.
5. Os erros da Central de Relatórios agora aparecem na própria seção em vez de permanecerem ocultos.
6. PHIVOLCS e PVMBG só são considerados conectados quando seus níveis de alerta foram realmente reconhecidos; mensagens de parser vazio são apresentadas como falha, não como sucesso silencioso.
7. Ajustado o mapeamento de níveis romanos do PVMBG para reconhecer também `Level I (Normal)` como nível 1.

### Verificação desta correção
- `node --check server/server.mjs` — passou.
- `node --check server/reports.mjs` — passou.
- Parser de níveis do PVMBG testado com amostra estrutural baseada na tabela oficial: reconheceu Anak Krakatau, Merapi, Semeru, Dukono, Ibu e Agung com níveis III, II e I.
- As páginas oficiais consultadas em 16/11/2026 retornaram informação atual: PHIVOLCS lista níveis para Taal, Kanlaon, Mayon, Bulusan e Pinatubo; PVMBG lista níveis ativos para vulcões indonésios e relatórios do dia. A conexão externa do computador do usuário ainda precisa ser testada localmente.
- Build integral do frontend continua pendente porque esta cópia não possui `node_modules` e não foi possível obter dependências no ambiente de execução.


## Correção adicional — latência, timeouts e repetição de chamadas (16/11/2026)

### Backend / coleta

1. `cachedFetch` agora retorna `updatedAt` e `cacheAgeMs`, compartilha requisições em andamento e preserva a última resposta bem-sucedida em caso de falha. Respostas antigas carregam `stale: true`.
2. Timeouts por fonte foram reduzidos e aplicados até a leitura completa do corpo HTTP, não somente até receber os cabeçalhos.
3. PHIVOLCS: consulta principal com fallback curto; somente três boletins individuais são buscados como enriquecimento, pois os níveis gerais permanecem extraídos da listagem. Os erros de detalhes não invalidam os níveis reconhecidos.
4. PVMBG: páginas de níveis e relatórios são consultadas em paralelo, e qualquer resposta válida é preservada mesmo se a outra falhar.
5. USGS HANS: status de todos os vulcões monitorados e lista de alertas elevados passam a ser consultados em paralelo e compartilhados por cache. A barra de status usa `/api/usgs` sem esperar o download de narrativas individuais. A Central de Relatórios busca detalhes somente para os dois alertas elevados mais recentes.
6. GVP: após HTTP 403, a consulta é suspensa por uma hora para não repetir chamadas ao mesmo host. Timeout/429/5xx entram em pausa temporária de cinco minutos; uma segunda rota semanal pode ser tentada dentro da mesma rodada. O código não tenta contornar bloqueios de acesso do Smithsonian.
7. Erros de origem e timeout são mantidos por fonte; cache antigo não é descrito como dado recém-atualizado.
8. A agregação dos relatórios mantém deduplicação e cache, com tempo máximo de execução limitado no servidor.

### Frontend

1. USGS HANS passou a ser consultado pelo backend local, eliminando a consulta paralela direta do navegador.
2. Leitura JSON no frontend agora mantém o timeout ativo durante a leitura do corpo e informa claramente qual endpoint excedeu o prazo; isso substitui mensagens pouco úteis como `signal is aborted without reason`.
3. Os tempos máximos do frontend correspondem aos limites dos endpoints locais.
4. Bloqueio contra chamadas sobrepostas no ciclo de atualização dos observatórios e na Central de Relatórios.
5. A tentativa automática de recuperação dos observatórios incompletos foi espaçada de 60 segundos para cinco minutos.
6. Fontes que usam cache antigo aparecem em âmbar com a indicação `cache`; não são exibidas como atualizadas naquele momento.

### Validação desta alteração

- `node --check server/reports.mjs` — passou.
- `node --check server/server.mjs` — passou.
- Transpilação sintática TypeScript/TSX — 10 arquivos, zero erros de sintaxe.
- Servidor local: `/api/health` respondeu JSON `ok: true`; endpoint desconhecido `/api/*` respondeu JSON 404.
- Teste com fetch simulado do USGS: lista de monitorados preservada, consulta única compartilhada entre status e Central, sem duplicação de chamadas.
- Teste com resposta HTTP 403 simulada do GVP: bloqueio reconhecido e consultas diárias subsequentes suprimidas na mesma instância.

### Limitações que permanecem

1. O Smithsonian respondeu HTTP 403 nas capturas fornecidas. O código não pode transformar uma proibição do servidor remoto em acesso permitido; agora ele evita repetir chamadas, mostra a falha corretamente e mantém as demais fontes ativas. O acesso só voltará quando o servidor de origem aceitar as requisições do ambiente do usuário ou houver um feed oficial alternativo acessível.
2. Não foi possível executar chamadas reais aos sites externos neste ambiente, portanto a conectividade precisa ser confirmada na máquina do usuário.
3. `npm run build` completo não foi executado porque `node_modules` não está instalado nesta cópia. A transpilação sintática dos TS/TSX passou; execute `npm ci` e `npm run build` localmente para a verificação completa de tipos e bundle.

## Ajuste de inicialização — executar tudo com `npm run dev` (16/11/2026)

- `npm run dev` agora inicia automaticamente o backend Node local na porta 8787, aguarda `/api/health` responder e então inicia o Vite.
- Não é necessário abrir dois terminais nem iniciar manualmente `npm run dev:api`.
- O backend continua sendo um serviço local interno, usado para proxy, cache, parser e chamadas a fontes que não permitem acesso direto pelo navegador.
- Não foi adicionada dependência npm nova; o script usa recursos nativos do Node.
- `npm run dev:frontend` permanece disponível para iniciar apenas o Vite quando for intencional.
- `npm run dev:api` e `npm start` permanecem disponíveis para diagnóstico/produção.
- O script encerra os dois processos quando o usuário para o `npm run dev`.
- Validação sintática: `node --check scripts/dev.mjs` e leitura do `package.json`.

## Integração de observatórios oficiais adicionais e simplificação visual (16/11/2026)

### Fontes oficiais adicionadas

1. **JMA — Japan Meteorological Agency:** leitura da página oficial de informações recentes para montanhistas, com associação por nomes japoneses conhecidos ao catálogo global e captura da data/nível quando presentes.
   - https://www.data.jma.go.jp/vois/data/report/activity_info/index.html
2. **INGV — Osservatorio Etneo:** leitura dos comunicados vulcânicos e VONA oficiais para Etna, Stromboli e Vulcano, preservando data, descrição e link do documento original.
   - https://www.ct.ingv.it/sezioniesterne/Comunicati/ComunicatiVulcanici.php
   - https://www.ct.ingv.it/sezioniesterne/Comunicati/ComunicatiVonaN.php?I=0
3. **SERNAGEOMIN / OVDAS:** leitura da seção de alertas vulcânicos vigentes do Chile e associação somente a nomes existentes no catálogo global.
   - https://www.sernageomin.cl/alertas-volcanicas/
4. **INSIVUMEH:** leitura do índice oficial de boletins diários, semanais e especiais; documentos sem data ou sem nome de vulcão permanecem como atualização genérica e não são usados para afirmar atividade atual de um vulcão específico.
   - https://insivumeh.gob.gt/vulca-boletin-diario/
5. **VAAC Global via Bureau of Meteorology (BOM):** leitura dos avisos de cinzas recebidos nas últimas 24 horas dos nove centros VAAC globais. Cada aviso é associado pelo nome/número do vulcão, VAAC emissor, DTG, número do aviso e área, quando identificáveis.
   - https://www.bom.gov.au/aviation/warnings/volcanic-ash/

As fontes anteriormente existentes foram preservadas: Smithsonian GVP, PHIVOLCS, PVMBG, USGS HANS e NASA/Google News. O BOM é utilizado como agregador oficial de avisos dos nove VAACs; não foi inventado um endpoint para cada centro.

### Resiliência e associação

- Cada observatório adicional é consultado de forma independente em paralelo, com timeout por fonte, cache TTL, deduplicação de chamadas em andamento e fallback para a última resposta válida.
- A falha de uma fonte não invalida as respostas das demais.
- O catálogo Smithsonian WFS agora tem fallback para a lista mundial do USGS Volcano API, que é documentada pelo USGS como lista mundial baseada no catálogo GVP. Isso permite associar boletins nacionais quando o WFS do Smithsonian está temporariamente bloqueado.
- A resposta de catálogo precisa conter ao menos 50 registros reconhecidos para ser aceita; respostas vazias/incompletas acionam o fallback.
- Itens oficiais são armazenados com fonte, URL, data e texto. Notícias não substituem categorias oficiais quando já existe boletim oficial confirmado para o mesmo vulcão.
- O índice INSIVUMEH sem data de publicação não cria um card de atividade atual associado a vulcão; permanece, quando identificável, como documento genérico na lista de atualizações.
- O texto do panorama e os chips de status das fontes continuam sendo calculados e preservados no payload/backend, mas foram removidos da apresentação visual da seção principal.

### Alteração visual

- A seção `ATIVIDADE VULCÂNICA NO MOMENTO` mantém o título, contador e carrossel existente.
- Foram ocultados o parágrafo longo do panorama, a lista de chips de fontes, o subtítulo do carrossel e o carimbo textual de contagem/IA.
- Os dados continuam sendo coletados, interpretados e consolidados no backend; somente a apresentação textual foi removida.
- O carrossel continua sendo alimentado pelos relatórios oficiais e notícias associadas ao número GVP do vulcão.
- Quando existe relatório oficial confirmado, as categorias visíveis dos cards passam a vir das fontes oficiais; notícias não confirmadas não sobrescrevem a classificação oficial.
- O corpo da seção não adiciona rolagem vertical própria.

### Validação desta entrega

- `node --check server/reports.mjs` — passou.
- `node --check server/server.mjs` — passou.
- `node --check scripts/dev.mjs` — passou.
- Transpilação sintática de `src/components/Intel.tsx` com TypeScript 5.8.3 — zero diagnósticos.
- Testes isolados com respostas simuladas confirmaram associação de JMA (Sakurajima/Aso), INGV (Etna/Stromboli), SERNAGEOMIN (Villarrica/Nevados de Chillán), INSIVUMEH (Fuego) e VAAC Darwin (Semeru).
- Teste de fallback do catálogo: com Smithsonian WFS retornando HTTP 403, o catálogo alternativo USGS foi reconhecido e permitiu associar Sakurajima.
- Não foram realizadas chamadas reais às fontes externas a partir deste ambiente, pois não há acesso DNS/rede no ambiente de construção. A conectividade real precisa ser conferida na máquina do usuário.
- Build completo do Vite/React não foi executado porque `node_modules` não está incluído no ZIP. Executar `npm ci` e `npm run build` localmente.

### Limites conhecidos

- A página INSIVUMEH é um índice de documentos. O código associa boletins a vulcões apenas quando o nome está presente no texto/atributos do link e a data é identificável; não baixa nem extrai automaticamente o texto interno de todos os PDFs.
- INGV e SERNAGEOMIN dependem da estrutura HTML oficial atual. Mudanças nos sites podem exigir ajuste de parser; respostas não reconhecidas são reportadas como fonte indisponível, não como sucesso.
- JMA publica parte dos avisos em japonês. O parser associa os nomes japoneses mapeados; novos nomes/formatos precisam de aliases adicionais.
- BOM fornece um agregado dos nove VAACs. O código registra o VAAC emissor de cada aviso e não afirma que todos os centros sempre terão avisos ativos.
- Outros observatórios nacionais só devem ser adicionados quando houver feed/API/página oficial pública verificável; não existe um endpoint mundial universal e não serão criadas integrações fictícias.


## Ajuste — legenda minimizável do mapa (16/11/2026)

- A legenda do mapa agora possui um cabeçalho/botão clicável para minimizar e expandir o conteúdo sem ocultar o mapa ou alterar marcadores.
- O controle é acessível por teclado, informa `aria-expanded` e mantém o conteúdo associado por `aria-controls`.
- O estado minimizado deixa visível apenas o botão compacto “Legenda” com sinal de expansão; ao reabrir, todos os itens da legenda retornam.
- A legenda deixa de ser ocultada automaticamente em telas pequenas; em dispositivos móveis também pode ser minimizada para liberar espaço no mapa.
- Rótulos e dicas de acessibilidade traduzidos em inglês, português, espanhol e alemão.
- Alterações limitadas a `src/components/MapView.tsx`, `src/styles.css` e `src/i18n.ts`; coleta, dados, filtros, mapa Leaflet e marcadores não foram modificados.
- Build completo não executado nesta cópia porque `node_modules` não está instalado. Recomenda-se `npm ci` seguido de `npm run build` no ambiente local.

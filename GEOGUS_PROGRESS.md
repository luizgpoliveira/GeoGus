# GeoGus â€” progresso de implementaÃ§Ã£o

Este arquivo registra o estado da entrega para permitir retomada em outra sessÃ£o sem reanalisar todo o projeto.

## Arquitetura preservada

- Frontend: React 18 + TypeScript + Vite.
- Mapa: Leaflet e marker cluster existentes.
- Backend: servidor Node em `server/server.mjs` e coletor em `server/reports.mjs`.
- PersistÃªncia dos relatÃ³rios: `server/data/reports.json`.
- NÃ£o houve troca de framework, renomeaÃ§Ã£o do app ou reconstruÃ§Ã£o da arquitetura.

## Implementado nesta alteraÃ§Ã£o

1. Galeria da seÃ§Ã£o `ATIVIDADE VULCÃ‚NICA NO MOMENTO` convertida em carrossel horizontal com setas discretas, sem quebra de linha.
2. NavegaÃ§Ã£o por rolagem horizontal nativa, compatÃ­vel com toque/arraste em dispositivos mÃ³veis.
3. Setas sÃ£o desabilitadas quando nÃ£o existe conteÃºdo naquela direÃ§Ã£o; o estado Ã© recalculado ao rolar e redimensionar.
4. Cinco cards sÃ£o exibidos em telas largas; o nÃºmero se adapta em larguras menores.
5. Cards continuam usando os dados e componentes existentes. `LOCALIZAR NO MAPA` mantÃ©m o callback atual. `SAIBA MAIS` abre o painel de detalhes existente.
6. Cards da Ã¡rea de atividade nÃ£o sÃ£o alimentados por boletins BGVN antigos: a galeria considera apenas itens dos Ãºltimos sete dias. Os boletins mais antigos continuam acessÃ­veis em `ATUALIZAÃ‡Ã•ES`/histÃ³rico.
7. A atividade usada para marcar vulcÃµes no mapa permanece limitada a 48 horas.
8. Coleta GVP ampliada para relatÃ³rio semanal completo, RSS semanal, relatÃ³rio diÃ¡rio e boletins BGVN. O boletim BGVN usa a pÃ¡gina oficial `reports_bgvn.cfm` e parser prÃ³prio para seu HTML (os relatÃ³rios usam cabeÃ§alhos internos h3/h4 dentro de cada artigo h5).
9. Categorias novas do tipo `ERUPCAO_RECENTE`, `ERUPCAO` contÃ­nua e `INQUIETACAO` aplicadas conforme o tipo de relatÃ³rio GVP, sem converter todo nÃ­vel de alerta em erupÃ§Ã£o.
10. ExtraÃ§Ã£o de altura de cinzas em km ou metros, convertendo metros para km.
11. Intervalos semanais como `5 November-11 November 2026` recebem data final consistente e IDs estÃ¡veis para evitar duplicaÃ§Ã£o nas sincronizaÃ§Ãµes.
12. A lista de atualizaÃ§Ãµes foi ampliada para sete dias e inclui boletins BGVN, preservando o panorama principal com janela estrita de 48 horas.
13. O texto enviado ao serviÃ§o de IA opcional contÃ©m uma amostra maior da narrativa oficial (atÃ© 700 caracteres por item). O texto coletado Ã© armazenado no registro, com limite de seguranÃ§a de 12.000 caracteres por item semanal/diÃ¡rio e 12.000 no boletim.

## Arquivos alterados

- `src/components/Intel.tsx` â€” carrossel, setas e aÃ§Ã£o `Saiba mais`.
- `src/App.tsx` â€” callback para abrir os detalhes do vulcÃ£o jÃ¡ existentes.
- `src/styles.css` â€” layout horizontal, setas, responsividade e categoria de erupÃ§Ã£o recente. Arquivo mantido em codificaÃ§Ã£o Windows-1252.
- `src/i18n.ts` â€” rÃ³tulos traduzidos das setas, botÃ£o e categoria.
- `src/api.ts` â€” eventos usados na atividade do mapa limitados a 48 horas.
- `server/reports.mjs` â€” coletores e parsers GVP, janela do panorama e sincronizaÃ§Ã£o/deduplicaÃ§Ã£o.

## ValidaÃ§Ã£o executada

- `node --check server/reports.mjs` â€” passou.
- `node --check server/server.mjs` â€” passou.
- TranspilaÃ§Ã£o sintÃ¡tica de arquivos TS/TSX â€” passou (sem verificaÃ§Ã£o de tipos completa).
- Teste isolado dos parsers com HTML/RSS de fixture: semanal, RSS, diÃ¡rio e BGVN; os quatro foram reconhecidos e repetiÃ§Ã£o de sincronizaÃ§Ã£o nÃ£o aumentou a quantidade de registros.
- Acessibilidade da pÃ¡gina GVP e formato dos relatÃ³rios foram confrontados com a estrutura pÃºblica do Smithsonian.

## Pendente / limitaÃ§Ãµes conhecidas

1. NÃ£o foi possÃ­vel executar `npm run build` nesta cÃ³pia porque o ZIP nÃ£o contÃ©m `node_modules` e o ambiente de inspeÃ§Ã£o nÃ£o tinha acesso Ã  rede para instalar dependÃªncias. Execute `npm ci` e depois `npm run build` no computador local.
2. A conectividade real do processo Node do seu ambiente com GVP/observatÃ³rios deve ser validada apÃ³s iniciar o servidor; o teste executado usou fixtures, nÃ£o chamadas externas reais. O servidor pode receber HTTP 403/bloqueio de proteÃ§Ã£o do GVP. Os status das fontes mostram falhas reais e o RSS semanal Ã© uma rota alternativa.
3. A importaÃ§Ã£o automÃ¡tica de ediÃ§Ãµes semanais anteriores pela aba `vtab=archive` ainda precisa de validaÃ§Ã£o: a pÃ¡gina oficial foi confirmada, mas a resposta consultada nÃ£o expÃ´s blocos histÃ³ricos completos para parser. O coletor cobre a ediÃ§Ã£o semanal publicada atualmente e o RSS.
4. O CAP nÃ£o foi integrado: nÃ£o foi possÃ­vel confirmar um endpoint CAP GVP utilizÃ¡vel nesta entrega. NÃ£o foi criada uma API fictÃ­cia.
5. Reuters/AP sÃ£o consultadas pelo agregador de notÃ­cias jÃ¡ existente (Google News), e nÃ£o por APIs prÃ³prias da Reuters/AP.
6. A interpretaÃ§Ã£o por IA depende de `AI_API_URL`, `AI_API_KEY` e opcionalmente `AI_MODEL` no ambiente do servidor. Sem essas variÃ¡veis, o sistema usa as regras determinÃ­sticas jÃ¡ existentes. Nenhuma chave foi adicionada ao projeto.
7. Esta alteraÃ§Ã£o nÃ£o adiciona novos observatÃ³rios/VAAC alÃ©m das integraÃ§Ãµes jÃ¡ presentes.

## CorreÃ§Ã£o adicional â€” proxy local do Vite

- O proxy `/api/gvp` agora aponta para `http://127.0.0.1:8787`, evitando resoluÃ§Ã£o de `localhost` para IPv6 (`::1`) em ambientes Windows.
- Foi adicionado o script `npm run dev:api` para iniciar explicitamente o backend local.
- Em desenvolvimento, o backend e o Vite precisam ficar ativos em dois terminais separados. `npm start` tambÃ©m inicia o backend.

## PrÃ³ximos passos locais

1. Fazer backup da pasta atual.
2. Extrair esta versÃ£o sobre uma cÃ³pia de teste, mantendo o arquivo `server/data/reports.json` do seu projeto caso tenha recebido novos registros desde o ZIP enviado.
3. Executar `npm ci`.
4. Executar `npm run build`.
5. Iniciar o backend com `npm start` e o frontend com `npm run dev` em outro terminal, seguindo o fluxo normal do projeto.
6. Conferir os indicadores de status das fontes e testar setas, `LOCALIZAR NO MAPA` e `SAIBA MAIS`.

## CorreÃ§Ã£o â€” APIs locais e disponibilidade das fontes (16/11/2026)

1. Corrigido o proxy de desenvolvimento Vite: agora `'/api'` inteiro Ã© encaminhado para `http://127.0.0.1:8787`, incluindo `/api/gvp`, `/api/reports`, `/api/phivolcs` e `/api/pvmbg`. Antes, somente `/api/gvp` era encaminhado; os demais endpoints recebiam o `index.html` do Vite e falhavam ao executar `response.json()` com `Unexpected token '<'`.
2. Adicionado `GET /api/health` para distinguir backend local ativo de falha de acesso Ã s fontes externas.
3. Rotas `/api/*` nÃ£o reconhecidas agora respondem JSON 404, nunca o HTML da aplicaÃ§Ã£o.
4. O frontend valida `Content-Type` e o corpo antes de interpretar JSON; respostas HTML agora geram erro explÃ­cito com instruÃ§Ã£o sobre backend/proxy.
5. Os erros da Central de RelatÃ³rios agora aparecem na prÃ³pria seÃ§Ã£o em vez de permanecerem ocultos.
6. PHIVOLCS e PVMBG sÃ³ sÃ£o considerados conectados quando seus nÃ­veis de alerta foram realmente reconhecidos; mensagens de parser vazio sÃ£o apresentadas como falha, nÃ£o como sucesso silencioso.
7. Ajustado o mapeamento de nÃ­veis romanos do PVMBG para reconhecer tambÃ©m `Level I (Normal)` como nÃ­vel 1.

### VerificaÃ§Ã£o desta correÃ§Ã£o
- `node --check server/server.mjs` â€” passou.
- `node --check server/reports.mjs` â€” passou.
- Parser de nÃ­veis do PVMBG testado com amostra estrutural baseada na tabela oficial: reconheceu Anak Krakatau, Merapi, Semeru, Dukono, Ibu e Agung com nÃ­veis III, II e I.
- As pÃ¡ginas oficiais consultadas em 16/11/2026 retornaram informaÃ§Ã£o atual: PHIVOLCS lista nÃ­veis para Taal, Kanlaon, Mayon, Bulusan e Pinatubo; PVMBG lista nÃ­veis ativos para vulcÃµes indonÃ©sios e relatÃ³rios do dia. A conexÃ£o externa do computador do usuÃ¡rio ainda precisa ser testada localmente.
- Build integral do frontend continua pendente porque esta cÃ³pia nÃ£o possui `node_modules` e nÃ£o foi possÃ­vel obter dependÃªncias no ambiente de execuÃ§Ã£o.


## CorreÃ§Ã£o adicional â€” latÃªncia, timeouts e repetiÃ§Ã£o de chamadas (16/11/2026)

### Backend / coleta

1. `cachedFetch` agora retorna `updatedAt` e `cacheAgeMs`, compartilha requisiÃ§Ãµes em andamento e preserva a Ãºltima resposta bem-sucedida em caso de falha. Respostas antigas carregam `stale: true`.
2. Timeouts por fonte foram reduzidos e aplicados atÃ© a leitura completa do corpo HTTP, nÃ£o somente atÃ© receber os cabeÃ§alhos.
3. PHIVOLCS: consulta principal com fallback curto; somente trÃªs boletins individuais sÃ£o buscados como enriquecimento, pois os nÃ­veis gerais permanecem extraÃ­dos da listagem. Os erros de detalhes nÃ£o invalidam os nÃ­veis reconhecidos.
4. PVMBG: pÃ¡ginas de nÃ­veis e relatÃ³rios sÃ£o consultadas em paralelo, e qualquer resposta vÃ¡lida Ã© preservada mesmo se a outra falhar.
5. USGS HANS: status de todos os vulcÃµes monitorados e lista de alertas elevados passam a ser consultados em paralelo e compartilhados por cache. A barra de status usa `/api/usgs` sem esperar o download de narrativas individuais. A Central de RelatÃ³rios busca detalhes somente para os dois alertas elevados mais recentes.
6. GVP: apÃ³s HTTP 403, a consulta Ã© suspensa por uma hora para nÃ£o repetir chamadas ao mesmo host. Timeout/429/5xx entram em pausa temporÃ¡ria de cinco minutos; uma segunda rota semanal pode ser tentada dentro da mesma rodada. O cÃ³digo nÃ£o tenta contornar bloqueios de acesso do Smithsonian.
7. Erros de origem e timeout sÃ£o mantidos por fonte; cache antigo nÃ£o Ã© descrito como dado recÃ©m-atualizado.
8. A agregaÃ§Ã£o dos relatÃ³rios mantÃ©m deduplicaÃ§Ã£o e cache, com tempo mÃ¡ximo de execuÃ§Ã£o limitado no servidor.

### Frontend

1. USGS HANS passou a ser consultado pelo backend local, eliminando a consulta paralela direta do navegador.
2. Leitura JSON no frontend agora mantÃ©m o timeout ativo durante a leitura do corpo e informa claramente qual endpoint excedeu o prazo; isso substitui mensagens pouco Ãºteis como `signal is aborted without reason`.
3. Os tempos mÃ¡ximos do frontend correspondem aos limites dos endpoints locais.
4. Bloqueio contra chamadas sobrepostas no ciclo de atualizaÃ§Ã£o dos observatÃ³rios e na Central de RelatÃ³rios.
5. A tentativa automÃ¡tica de recuperaÃ§Ã£o dos observatÃ³rios incompletos foi espaÃ§ada de 60 segundos para cinco minutos.
6. Fontes que usam cache antigo aparecem em Ã¢mbar com a indicaÃ§Ã£o `cache`; nÃ£o sÃ£o exibidas como atualizadas naquele momento.

### ValidaÃ§Ã£o desta alteraÃ§Ã£o

- `node --check server/reports.mjs` â€” passou.
- `node --check server/server.mjs` â€” passou.
- TranspilaÃ§Ã£o sintÃ¡tica TypeScript/TSX â€” 10 arquivos, zero erros de sintaxe.
- Servidor local: `/api/health` respondeu JSON `ok: true`; endpoint desconhecido `/api/*` respondeu JSON 404.
- Teste com fetch simulado do USGS: lista de monitorados preservada, consulta Ãºnica compartilhada entre status e Central, sem duplicaÃ§Ã£o de chamadas.
- Teste com resposta HTTP 403 simulada do GVP: bloqueio reconhecido e consultas diÃ¡rias subsequentes suprimidas na mesma instÃ¢ncia.

### LimitaÃ§Ãµes que permanecem

1. O Smithsonian respondeu HTTP 403 nas capturas fornecidas. O cÃ³digo nÃ£o pode transformar uma proibiÃ§Ã£o do servidor remoto em acesso permitido; agora ele evita repetir chamadas, mostra a falha corretamente e mantÃ©m as demais fontes ativas. O acesso sÃ³ voltarÃ¡ quando o servidor de origem aceitar as requisiÃ§Ãµes do ambiente do usuÃ¡rio ou houver um feed oficial alternativo acessÃ­vel.
2. NÃ£o foi possÃ­vel executar chamadas reais aos sites externos neste ambiente, portanto a conectividade precisa ser confirmada na mÃ¡quina do usuÃ¡rio.
3. `npm run build` completo nÃ£o foi executado porque `node_modules` nÃ£o estÃ¡ instalado nesta cÃ³pia. A transpilaÃ§Ã£o sintÃ¡tica dos TS/TSX passou; execute `npm ci` e `npm run build` localmente para a verificaÃ§Ã£o completa de tipos e bundle.

## Ajuste de inicializaÃ§Ã£o â€” executar tudo com `npm run dev` (16/11/2026)

- `npm run dev` agora inicia automaticamente o backend Node local na porta 8787, aguarda `/api/health` responder e entÃ£o inicia o Vite.
- NÃ£o Ã© necessÃ¡rio abrir dois terminais nem iniciar manualmente `npm run dev:api`.
- O backend continua sendo um serviÃ§o local interno, usado para proxy, cache, parser e chamadas a fontes que nÃ£o permitem acesso direto pelo navegador.
- NÃ£o foi adicionada dependÃªncia npm nova; o script usa recursos nativos do Node.
- `npm run dev:frontend` permanece disponÃ­vel para iniciar apenas o Vite quando for intencional.
- `npm run dev:api` e `npm start` permanecem disponÃ­veis para diagnÃ³stico/produÃ§Ã£o.
- O script encerra os dois processos quando o usuÃ¡rio para o `npm run dev`.
- ValidaÃ§Ã£o sintÃ¡tica: `node --check scripts/dev.mjs` e leitura do `package.json`.

## AdaptaÃ§Ã£o para deploy no Vercel (16/11/2026)

### DiagnÃ³stico
- O frontend Vite estava sendo publicado como site estÃ¡tico, mas as chamadas `/api/gvp`, `/api/usgs`, `/api/phivolcs`, `/api/pvmbg` e `/api/reports` eram atendidas apenas pelo servidor Node local `server/server.mjs` na porta 8787.
- O proxy em `vite.config.ts` existe somente no servidor de desenvolvimento Vite e nÃ£o cria rotas `/api` no deploy. Por isso, o domÃ­nio Vercel retornava 404 para todas essas rotas.

### ImplementaÃ§Ã£o
- Adicionadas Vercel Functions Node.js no diretÃ³rio raiz `api/`: `gvp.mjs`, `usgs.mjs`, `phivolcs.mjs`, `pvmbg.mjs`, `reports.mjs` e `health.mjs`.
- `/api/gvp` consulta o WFS oficial do Smithsonian, valida o pedido WFS GetFeature, aplica timeout, deduplicaÃ§Ã£o/cache em memÃ³ria e devolve JSON.
- As rotas de observatÃ³rios reutilizam os coletores existentes em `server/reports.mjs`, sem duplicar os parsers.
- `vercel.json` configura `maxDuration` de atÃ© 60 segundos e inclui `server/data/reports.json` no pacote das funÃ§Ãµes.
- Em Vercel Functions, as alteraÃ§Ãµes do histÃ³rico passam a ser gravadas em `/tmp` durante a vida da instÃ¢ncia; o arquivo versionado continua sendo a semente. `/tmp` Ã© temporÃ¡rio e nÃ£o substitui armazenamento persistente.
- O comando local `npm run dev` e o proxy local do Vite foram preservados pelo projeto `scripts/dev.mjs`.
- Service worker atualizado para cache v5. `Response.clone()` agora Ã© chamado imediatamente, antes do consumo do corpo da resposta, e respostas HTTP nÃ£o-OK nÃ£o sÃ£o guardadas em cache. Isso corrige o erro `Response body is already used` e evita manter 404s em cache.

### ValidaÃ§Ãµes executadas
- `node --check` em todas as funÃ§Ãµes `api/*.mjs`, arquivos Node `server/*.mjs`, scripts e `public/sw.js` â€” passou.
- `vercel.json` e `package.json` validados como JSON â€” passou.
- Smoke tests dos handlers Vercel: `/api/health` responde 200 JSON; `/api/gvp` sem parÃ¢metro responde 400 JSON; mÃ©todo POST em GET-only responde 405 â€” passou.
- Servidor Node local continuou respondendo `/api/health` â€” passou.
- NÃ£o foi executado deploy real no Vercel nem verificaÃ§Ã£o live das fontes externas, pois Ã© necessÃ¡rio publicar no projeto do usuÃ¡rio.
- Build Vite completo nÃ£o foi executado nesta cÃ³pia sem instalaÃ§Ã£o de `node_modules`.

### ConfiguraÃ§Ã£o de deploy
- A raiz do projeto no Vercel deve ser a pasta que contÃ©m `package.json`, `vercel.json` e `api/`.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- NÃ£o adicionar rewrites que direcionem `/api/*` para `index.html`.

### LimitaÃ§Ã£o de persistÃªncia
- As Vercel Functions sÃ£o stateless e o filesystem de execuÃ§Ã£o Ã© efÃªmero, exceto `/tmp`. A coleta atual mantÃ©m cache e histÃ³rico de trabalho enquanto a instÃ¢ncia permanece ativa, mas a garantia de histÃ³rico cumulativo entre cold starts / instÃ¢ncias requer storage persistente externo (por exemplo, Vercel Blob ou banco de dados). Nenhum serviÃ§o externo foi criado ou configurado automaticamente.


## Camada de estruturas geológicas históricas e carrossel estritamente eruptivo (16/11/2026)

### Mapa — estruturas históricas (camada independente)
- Adicionada a camada `src/historicalGeology.ts` ao mapa Leaflet como grupo separado dos vulcões GVP.
- Mantidas representações de Mendanha/Nova Iguaçu, paleocaldeira proposta na Província Mineral de Alta Floresta (Amazônia), caldeiras paleoproterozoicas de Uatumã/Tapajós, Complexo Alcalino de Poços de Caldas e Complexo Vulcânico de Fernando de Noronha.
- Cada ponto tem coordenada regional aproximada, idade/geologia, ressalvas científicas e link de referência. Os marcadores usam símbolo violeta e popup com aviso de que não representam erupção atual.
- A camada é independente do filtro operacional `erupting`: as estruturas antigas continuam representadas no mapa sem serem classificadas como vulcões em atividade.
- Adicionadas aliases de busca para “Vulcão de Nova Iguaçu”, “Vulcão da Amazônia”, “Caldeira de Alta Floresta” e nomes equivalentes.

### Carrossel / status atual
- A área de panorama textual permanece oculta; a seção inicial apresenta o título, contador e apenas o carrossel (ou mensagem curta quando não houver erupções confirmadas).
- O filtro operacional inicia sempre em `erupting` a cada abertura do sistema; durante a sessão, o usuário ainda pode selecionar outros filtros.
- O carrossel usa somente status `ERUPCAO` confirmados pelo WFS GVP `ContinuingEruption` ou por relatório de fonte oficial, confirmado e recente (até 48 h) cuja descrição indique explicitamente erupção em andamento.
- Alertas WATCH/WARNING do USGS e níveis III/IV de PHIVOLCS/PVMBG não bastam, isoladamente, para classificar um vulcão como em erupção.

### Faixa de histórico eruptivo
- Cards usam maior VEI registrado no histórico GVP Holoceno: VEI 6–8 = “Extremamente perigoso”; 4–5 = “Perigoso”; 2–3 = “Moderado”; 0–1 = “Tranquilo”; sem VEI = “Histórico insuficiente”.
- A nota do indicador esclarece que se trata de uma classificação visual própria do GeoGus sobre explosividade histórica, não de risco atual, previsão ou escala oficial de perigosidade.

### Validação
- A validação de TypeScript e build será feita após instalação das dependências. A classificação de erupção foi ajustada nas rotinas de PHIVOLCS, PVMBG e USGS para não tratar nível de alerta como erupção confirmada.

## Alterações desta entrega — estruturas antigas e carrossel de erupções confirmadas

- Criada camada cartográfica separada para estruturas geológicas antigas; não entram no catálogo GVP, na contagem de vulcões nem recebem status eruptivo.
- Registros ilustrativos: Complexo Alcalino do Mendanha (Nova Iguaçu), paleocaldeira proposta de Alta Floresta (Mato Grosso; hipótese em investigação), caldeiras regionais Uatumã/Tapajós (~1,88 Ga), Complexo Alcalino de Poços de Caldas e Complexo Vulcânico de Fernando de Noronha. Coordenadas regionais são aproximadas e identificadas no popup.
- Busca local reconhece aliases “Vulcão de Nova Iguaçu” e “Vulcão da Amazônia”, entre outros, e centraliza o mapa no marcador histórico.
- A seção “ATIVIDADE VULCÂNICA NO MOMENTO” não exibe mais o panorama textual nem mensagem textual vazia; quando existem erupções confirmadas, mostra somente os cards do carrossel.
- Na abertura, o filtro é redefinido para “em erupção” e a camada de vulcões é ativada. Marcadores históricos continuam numa camada violeta independente, com popup indicando que não há erupção atual confirmada.
- Carrossel e contagem usam apenas status `ERUPCAO`, baseado no GVP `ContinuingEruption` ou em boletim oficial confirmado, recente (48 h), associado a um vulcão e que descreva explicitamente atividade em andamento. Níveis de alerta, cores de aviação e estados de atenção não bastam.
- Faixas históricas dos cards usam o maior VEI válido encontrado no histórico Holoceno GVP: 6–8 “Extremamente perigoso · histórico”; 4–5 “Perigoso · histórico”; 2–3 “Moderado · histórico”; 0–1 “Tranquilo · histórico”. A legenda/tooltip esclarece que é uma referência de explosividade histórica, não avaliação de risco atual, exposição ou previsão. VEI ausente/inválido permanece “Histórico não classificado”.
- Reforçada a exclusão de textos de erupção encerrada/pausada, inclusive variantes em inglês e indonésio, para reduzir falsos positivos.
- Validações desta entrega: transpile sintático de TS/TSX e `node --check` dos servidores e funções API. Build completo depende de instalar as dependências (`npm ci`), não concluído neste ambiente.
- Validação de build: `npm run build` não pôde concluir porque o `node_modules` da área de trabalho estava parcial/incompleto e faltavam declarações de tipos de React/Leaflet e dependências auxiliares. O pacote entregue exclui `node_modules`; execute `npm ci` antes de `npm run build`. A transpilação sintática de todos os TS/TSX e a verificação `node --check` dos módulos Node passaram.

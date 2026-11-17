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


## Ajustes de camada histórica e carrossel recolhido (16/11/2026)

1. O carrossel `ATIVIDADE VULCÂNICA NO MOMENTO` agora inicia recolhido (`open=false`), deixando o mapa ocupar a tela; o cabeçalho continua disponível para expandir manualmente.
2. Criada a configuração independente `showHistoricalGeology`, desligada por padrão. Ela não depende de `showVolcanoes` e não mistura estruturas antigas com o mapa operacional.
3. A camada histórica agora utiliza clustering Leaflet e inclui todos os registros Pleistocenos devolvidos pela camada oficial do Smithsonian GVP (campo `holocene=false`) além dos cinco complexos/províncias regionais mantidos em `src/historicalGeology.ts`. O GVP descreve sua lista Pleistocena como preliminar; isso é informado no popup.
4. Vulcões Pleistocenos foram removidos dos marcadores operacionais; só aparecem quando a flag `Estruturas antigas` está ligada. A camada permanece desligada por padrão.
5. Busca de registros antigos ativa a camada histórica ao selecionar um item. Países das cinco estruturas regionais foram incluídos no seletor.
6. A lista Pleistocena é georreferenciada dinamicamente pelo WFS GVP já utilizado no catálogo; não foram inventados 100 pontos estáticos. O conjunto oficial consultado pelo site contém 1.452 registros, mas o total exibido no app depende da resposta do endpoint.

### Limitações / validação
- A lista Pleistocena do GVP é preliminar e pode conter dados incompletos/incorretos; cada popup informa essa ressalva.
- A camada terá mais de 100 pontos quando o endpoint de catálogo carregar corretamente. Se o GVP estiver indisponível, os cinco registros antigos locais permanecem disponíveis.
- Build completo e validação visual ainda dependem de `npm ci` e `npm run build` no ambiente do projeto.

### Correções adicionais após as capturas de tela
- A busca de nomes do catálogo Pleistoceno agora ativa a camada histórica e foca o marcador correto; buscas de localidades genéricas não ligam indevidamente a camada.
- Marcadores da camada Pleistocena usam `zoomToShowLayer` do MarkerCluster para abrir popup mesmo quando estão agrupados.
- A contagem do toggle é dinâmica: estruturas locais + registros Pleistocenos retornados pelo catálogo GVP.

- A camada histórica aplica deduplicação espacial de 12 km entre registros Pleistocenos GVP e complexos estáticos, reduzindo duplicatas de estruturas já representadas no catálogo.


## Correção de separação operacional x histórico (16/11/2026)
- `classifyVolcano` agora força entradas não-Holocenas para `EXTINTO` antes de considerar erupções contínuas, alertas ou relatórios.
- `App.tsx` passou a contar/notificar/listar como erupção somente registros `holocene === true`.
- `Intel.tsx` restringe o carrossel a vulcões Holocenos em erupção e inicia recolhido sem persistir estado aberto.
- `styles.css` esconde o corpo quando a seção não está aberta.
- Service worker atualizado para v6 e registro com `updateViaCache: none`; recarrega uma vez quando uma nova versão passa a controlar a página para evitar JS antigo em cache.

## Correção adicional: exclusão total do histórico da área operacional e atualização de cache (16/11/2026)
- `classifyVolcano` força todo registro Pleistoceno (`holocene=false`) para `EXTINTO` antes de avaliar qualquer alerta ou registro de erupção.
- Carrossel, contador, aba Em erupção, notificações e listas agora exigem `holocene === true` e `status === ERUPCAO`.
- `loadVolcanoCatalog` deduplica por VolcanoNumber e prefere o registro do catálogo Holoceno quando o mesmo ID aparece nas duas camadas.
- Carrossel contém estado inicial explicitamente fechado e CSS de proteção para `data-open=false`.
- Service Worker sobe para v6, registra com `updateViaCache: none`, chama update() e atualiza o cliente quando a nova versão passa a controlar a página.
- Vercel recebe cabeçalhos no-cache para `/`, `/index.html` e `/sw.js`, reduzindo a chance de servir entry point/worker antigos.

## Atualização 2026-11-16 — carrossel, fotos e notificações

- `src/components/Intel.tsx`: componente memoizado para não re-renderizar a cada atualização de terremotos/estado global; mantém cache de classificação histórica quando o carrossel fecha e reabre; imagens permanecem lazy-load no componente `VolcanoPhoto`.
- `src/api.ts`: feeds sísmicos USGS/EMSC agora usam cache curto de 45 s, deduplicação de chamadas simultâneas e timeout de 12 s por consulta.
- `src/App.tsx`: terremotos são verificados a cada 60 s; IDs novos usam `time` e `updated` para tolerar atraso de publicação do USGS (janela de 25 min), sem gerar alerta retroativo no carregamento inicial; consultas simultâneas são bloqueadas. Alterar filtros não reinicia a linha de base. Tsunami usa anti-concorrência e somente alertas operacionais Watch/Advisory/Warning entram na central. Erupções notificadas por episódio e relatórios oficiais novos sem alertas retroativos na primeira carga.
- `src/i18n.ts`: explica frequências, permissão, limitações de cobertura NOAA e necessidade de Web Push para entrega com app fechado.
- `src/styles.css`: separação visual dos grupos de configuração de notificação.
- `public/sw.js`: mantém exibição persistente de notificações e roteamento ao clicar; não há subscrição Web Push configurada nesta versão.
- `server/tsunami.mjs` + `api/tsunami.mjs`: coleta CAP oficial NOAA PTWC/NTWC, cache curto, timeout por feed e deduplicação em voo (mantidos e testados nesta atualização).

### Testes nesta atualização
- `node --check` em módulos Node, handler Vercel, servidor e service worker: aprovado.
- Transpilação sintática TypeScript/TSX dos seis arquivos modificados: aprovada.
- Teste CAP simulado: alerta WARNING interpretado e cache reutilizado: aprovado.
- Teste de guards contra chamadas sobrepostas e baseline: aprovado.
- `npm ci` excedeu o tempo limite neste ambiente; `npm run build`/typecheck completo não pôde ser concluído por dependências ausentes/incompletas.

### Limitações operacionais
- Notificações automáticas funcionam enquanto o GeoGus está aberto no navegador; timers em abas em segundo plano podem ser limitados pelo navegador. Para notificar com a aplicação fechada, é necessário configurar Web Push (VAPID, armazenamento de subscriptions e serviço de envio agendado), não incluído nesta entrega.
- Terremotos consultados por feed global USGS, com fallback EMSC; limiar padrão de alerta M≥2.5 e ajustável até M≥1.0 nas configurações.
- Tsunami atualmente cobre os feeds CAP NOAA PTWC/NTWC e suas regiões de serviço; não representa uma central mundial única de todos os centros nacionais.
- Imagens especiais de Erebus e Mount Michael/Saunders usam fontes curadas; as demais usam imagem GVP quando disponível ou busca estrita no Wikimedia Commons, caso contrário placeholder.

## Atualização — marcadores pulsantes, estabilidade do Leaflet e experiência mobile (17/11/2026)

### Mapa e marcadores
- Marcadores de vulcões em erupção usam anéis CSS de pulsação em vermelho; vulcões classificados como ativos/recentes usam pulsação âmbar mais lenta.
- Todos os terremotos aparecem como marcadores de raio com pulsação discreta; os que atingem o limiar de alerta usam pulsação vermelha mais intensa.
- No zoom mundial, terremotos próximos aparecem em clusters circulares com quantidade e cor derivada da maior magnitude agrupada; a partir do zoom 7, os eventos são individualizados e pulsantes. Clusters expandem/spiderfy no zoom máximo.
- Removido um `circleMarker` adicional por terremoto que era criado/removido no ciclo de vida do marker; a pulsação agora é CSS, reduzindo camadas extras e custo de renderização.
- Marcadores recebem prioridade de camada (`zIndexOffset`) e `riseOnHover`.
- O mapa registra `ResizeObserver`, resize, orientação e `visualViewport.resize`, chamando `invalidateSize` após alterações de viewport. Isso corrige mapas Leaflet que ficam com dimensões antigas depois de layout mobile/painéis/rotação.

### Mobile / PWA
- Em telas até 760 px, o mapa passa a ocupar o viewport completo.
- Barra superior e busca flutuam sobre o mapa; status das fontes é horizontal e compacto.
- Filtros viram faixa horizontal rolável junto à parte inferior, respeitando safe-area.
- Lista de terremotos/erupções vira bottom sheet; detalhes e notificações também são adaptados para telas estreitas.
- Controles de zoom têm área de toque ampliada; a legenda desktop não ocupa espaço no mobile.
- `index.html` recebeu metas de app mobile e o service worker/cache foi atualizado para v8 (`gg-sw-v8`, `gg-shell-v8`, `gg-data-v8`) para invalidar os assets anteriores.

### Erro de canal assíncrono do navegador
- Revisado o código do GeoGus: não há uso de `chrome.runtime`, `browser.runtime` ou listener de extensão que retorne `true` aguardando resposta. A mensagem `A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received` é normalmente emitida por uma extensão do navegador; não é possível corrigi-la no app se a origem for uma extensão. A atualização do service worker/cache foi feita; se a mensagem persistir, confirmar em janela anônima sem extensões.

### Validação desta rodada
- Transpilação sintática de 11 arquivos TypeScript/TSX com TypeScript: aprovada, sem diagnósticos sintáticos.
- `node --check` em `public/sw.js`, `server/server.mjs` e `server/reports.mjs`: aprovado.
- `/api/health` local: HTTP 200 JSON.
- `/api/gvp` sem parâmetro: HTTP 400 JSON (comportamento esperado, confirma que API local respondeu JSON).
- Tentativas curtas de consultar USGS HANS/PHIVOLCS/PVMBG/NOAA no ambiente de teste excederam 4 s; conectividade externa não foi validada nesta execução.
- `npm ci` excedeu o limite de tempo e deixou `node_modules` incompleto; `npm run build` completo/typecheck não pôde ser afirmado como aprovado. Executar `npm ci` e `npm run build` no ambiente do projeto antes do deploy.

## Atualização — mapa pulsante, estabilidade de renderização e interface mobile (17/11/2026)

- `src/components/MapView.tsx`: marcadores de erupção com pulsação vermelha; vulcões ativos/recentes com pulsação âmbar. Terremotos com pulsação própria; eventos acima do limite de alerta usam pulsação vermelha mais forte. Em zoom mundial, terremotos são agrupados em clusters com contagem e tonalidade baseada na maior magnitude; zoom 7+ individualiza os eventos. Clusters expandem ao toque/clique e fazem spiderfy no zoom máximo.
- Removidos `circleMarker` extras por terremoto; anéis são CSS pseudo-elements, diminuindo a quantidade de camadas Leaflet.
- Marcadores ganharam prioridade de camada e `riseOnHover`.
- Leaflet observa alterações de tamanho com `ResizeObserver`, `resize`, `orientationchange` e `visualViewport.resize`, recalculando a dimensão do mapa em layouts mobile, rotação e painéis.
- `src/styles.css`: layout mobile estilo app de mapas: mapa fullscreen, busca e status flutuantes, filtros horizontais na base, listas em bottom sheet, detalhes/notificações adaptados e áreas de toque maiores, com safe-area.
- `index.html`: metas de aplicação móvel instalável.
- `public/sw.js` e `src/main.tsx`: service worker/cache versionados para v8 para descarregar assets antigos no próximo deploy.
- A mensagem do console `A listener indicated an asynchronous response...` não é produzida por código do GeoGus identificado nesta revisão: o projeto não usa `chrome.runtime`/`browser.runtime` nem listeners de extensão. É comumente originada por extensão do navegador; validar em janela anônima sem extensões.

### Validação 17/11/2026
- Transpilação sintática de 11 arquivos TypeScript/TSX: aprovada, sem diagnósticos sintáticos.
- `node --check` em módulos do servidor, handlers API e service worker: aprovado.
- JSON de `package.json`, `vercel.json` e manifest: aprovado; chaves CSS balanceadas.
- `/api/health` local: HTTP 200 JSON; rota `/api` desconhecida: HTTP 404 JSON.
- `npm ci` excedeu o tempo disponível no ambiente e deixou dependências incompletas; build completo e typecheck não foram validados. Executar `npm ci` e `npm run build` localmente antes do deploy.
- A conectividade externa de todas as fontes não pode ser certificada nesta rodada; healthcheck comprova apenas o backend local.


## Correção adicional — Leaflet MapOptions (17/11/2026)
- Removida a opção `tap: true` em `src/components/MapView.tsx`, pois não pertence ao tipo `MapOptions` da versão do Leaflet utilizada.
- Mantida `touchZoom: true`; gestos de zoom continuam habilitados.
- Build tentado com `npm run build`, mas bloqueado por dependências/types incompletos no `node_modules` desta cópia (vários `@types/*` não encontrados). Executar `npm ci` e repetir `npm run build` no ambiente local.

---

## Atualização 2026-11-17 — marcadores do dia, notificações e consistência Vercel

### Alterações
- Terremotos: o navegador consulta `/api/earthquakes` em mesma origem tanto no `npm run dev` quanto no Vercel. USGS GeoJSON é primário; EMSC FDSN é fallback. Cache curto, deduplicação de requisições simultâneas e cache stale de até 15 minutos em falha de upstream.
- Rota local `/api/earthquakes` adicionada ao servidor Node de desenvolvimento; função `api/earthquakes.mjs` adicionada para Vercel.
- Polling sísmico a cada 60 segundos; atualização também ao voltar à aba visível ou recuperar conexão.
- O mapa pulsa somente terremotos ocorridos na data civil local atual. Clusters pulsam apenas quando contêm ao menos um terremoto de hoje. Magnitude alta, por si só, não aciona pulsação.
- Vulcões: somente status ERUPCAO confirmado pelo campo `ContinuingEruption` do GVP ou boletim oficial atual podem pulsar; status ATIVO/RECENTE fica estático.
- Relatórios oficiais usados para erupção atual são limitados ao dia local atual. Notificações de erupção exibem nome/local; terremotos exibem magnitude e local.
- Polling de erupções e relatórios ajustado para 5 minutos. Novos terremotos aceitam atraso de publicação do USGS de até 25 minutos para detectar eventos já ocorridos, mas somente os eventos de hoje geram alerta.
- Catálogo Holoceno é carregado primeiro e independentemente dos observatórios e do catálogo histórico. Consultas complementares atualizam classificação depois, sem bloquear marcadores iniciais.
- Catálogo Pleistoceno é carregado apenas quando a camada histórica é ligada.
- Cache Edge do GVP: 60s para consulta de erupção contínua; 1h para catálogo, com stale-while-revalidate.
- Service Worker atualizado para v9; terremotos e tsunami usam fetch de rede sem cache local de navegador.
- Timeout por tentativa do feed sísmico reduzido para 5,5s, para manter USGS + fallback EMSC dentro do limite da função Vercel.

### Testes realizados
- Sintaxe TypeScript/TSX: 11 arquivos transpilados, zero erros sintáticos.
- `node --check`: módulos do servidor, funções Vercel e Service Worker aprovados.
- `vercel.json`: JSON válido.
- Teste isolado do serviço de terremotos com USGS GeoJSON simulado: evento convertido corretamente, cache reutilizado e apenas uma chamada externa.
- Teste do handler `/api/earthquakes` com fetch simulado: HTTP 200, JSON e cabeçalhos de cache corretos.
- Teste local do backend: `/api/health` respondeu `ok: true`.

### Limitações conhecidas
- `npm run build` não pôde ser concluído neste ambiente porque `node_modules` está incompleto: `npm ci` não concluiu e faltam definições de tipos como React, Leaflet e GeoJSON. Os erros TS2688 são do ambiente de dependências incompleto; não são resultado do teste sintático dos arquivos.
- As fontes externas reais não puderam ser consultadas a partir do ambiente de trabalho; a validação de integração live deve ser concluída no deploy/ambiente do usuário.
- USGS disponibiliza feeds em ciclos de aproximadamente 1 minuto, mas o processamento/publicação pode atrasar alguns minutos; para eventos fora dos EUA, a própria documentação informa média de processamento de aproximadamente 20 minutos. O GeoGus consulta a cada minuto, mas não pode notificar antes da fonte publicar.
- Alertas contínuos dependem do GeoGus permanecer aberto. Notificações com o site fechado exigem Web Push/VAPID e armazenamento de subscriptions, que não fazem parte desta alteração.

## Integração de sismicidade brasileira (17/11/2026)
- Adicionado consumo do FDSN Event do Centro de Sismologia USP para a região brasileira (QuakeML/XML, limites geográficos e magnitude/período configuráveis).
- Eventos USP/RSBR são combinados com USGS; EMSC continua como fallback global quando o USGS falhar.
- Deduplicação espaço-temporal entre registros USP e globais, preservando proveniência de cada agência.
- Detalhes do evento informam se a solução USP é manual/revisada ou automática/preliminar.
- O status da faixa sísmica identifica `USGS + USP / RSBR` e expõe erros parciais.
- Incluído `BRASIL_SISMICO.md` com endpoints, limitações e distinção entre catálogo dinâmico e Boletim Sísmico Brasileiro estático.
- Incluído `npm run test:brasil` para validar parsing QuakeML e deduplicação sem depender da rede.
- Testes: parser QuakeML e merge sintético aprovados; 11 arquivos TS/TSX passaram por transpilation syntax check; módulos Node passaram em `node --check`.
- Build completo ainda não validado: `npm ci` não concluiu dentro do ambiente disponível; `npm run build` encontrou @types incompletos na instalação interrompida.

## 2026-11-17 — Ampliação da central sísmica multiorigem

- Mantidos conectores automáticos USGS ComCat, USGS FDSN regional (segunda via do mesmo catálogo), USP/BRASIS, LabSis/UFRN, SIS-UnB best-effort, SISBRA preliminar, EMSC, GFZ/GEOFON e ISC.
- NES/Unimontes agora descobre automaticamente os links dos boletins PDF na página institucional e RSS. PDFs são listados como documentos; ainda não são convertidos em eventos porque a extração de tabelas PDF e a separação de sismos naturais/artificiais não foi validada.
- Corrigida conversão de hora local (UTC-3) em tabelas Unimontes se uma tabela HTML/RSS estruturada for publicada.
- Melhorada preservação de células vazias em tabelas, para não deslocar colunas do boletim UnB.
- Status das fontes inclui endpoint, tipo, cobertura, cadência e documentos descobertos.
- Contagem Brasil/global agora usa coordenadas dentro da caixa geográfica brasileira, não o idioma do campo `place`.
- A deduplicação mantém fontes coincidentes; USGS FDSN é documentado como segunda via do ComCat, não catálogo independente.
- EarthScope/IRIS FDSN Event não foi incluído porque foi aposentado em 01/06/2026.
- Teste determinístico com fetch mockado validou 10 conectores, parsing, timezone, deduplicação e descoberta de PDFs.


## 2026-11-17 — Catálogo vulcânico mundial, supervulcões e alertas mais frequentes

### Catálogo mundial e mapa
- A visualização inicial força `country: ''` e `volcanoFilter: 'all'`, para não reabrir o mapa preso a um país ou somente à aba de erupções.
- O mapa carrega o catálogo Holoceno do Smithsonian GVP e, em uma camada agrupada separada, o catálogo Pleistoceno. A camada de estruturas geológicas pré-Quaternárias permanece desligada por padrão e separada dessas duas coleções.
- O catálogo GVP consultado é a cobertura Quaternária do banco: Holoceno (1.214 entradas na edição GVP v5.4.0, 07/08/2026) + Pleistoceno (1.452 entradas, lista preliminar). O número mostrado na interface é dinâmico e depende dos registros com coordenadas válidas retornados pelo WFS; não significa todos os edifícios vulcânicos de toda a história geológica da Terra.
- Os marcadores Pleistocenos usam camada violeta própria com clustering; vulcões Holocenos permanecem na camada operacional; estruturas pré-Quaternárias brasileiras continuam numa flag independente.
- Supervulcões/grandes caldeiras destacados em camada própria: Yellowstone, Long Valley, Valles Caldera, Toba e Taupo. A seleção segue exemplos de sistemas com supererupções VEI 8 descritos pelo USGS; o termo não é uma categoria universal padronizada nem indica perigo ou atividade atual.
- A camada Pleistoceno tenta novamente a cada 2 minutos e ao restabelecer conexão. Uma resposta vazia não é gravada como catálogo válido no cache.
- Catálogo Holoceno também tenta novamente a cada 2 minutos se a consulta inicial falhar. Coleta de alertas e relatórios continua independente do sucesso inicial do catálogo.
- O foco/busca de supervulcões encontra o marcador especial pelo nome correto.

### Alertas e desempenho
- Polling de estado vulcânico reduzido para 60 segundos; cache de alertas PHIVOLCS, PVMBG e USGS HANS reduzido para 45 segundos; cache da consulta GVP `ContinuingEruption` reduzido para 45 segundos, com stale-while-revalidate.
- Falha do WFS de erupções contínuas não bloqueia atualização de alertas recebidos de USGS HANS, PHIVOLCS ou PVMBG; a última lista contínua válida é preservada até recuperação do GVP.
- Atualizações de erupção continuam ao retornar à aba e ao recuperar a conexão. Fontes podem publicar em cadências próprias; polling de 60 segundos não transforma um boletim diário em feed instantâneo.
- `MapView.tsx` calcula uma assinatura visual dos dados de vulcões e erupções e só reconstrói marcadores quando coordenadas, status, alerta ou atividade mudam. Isso evita recriar milhares de pins a cada ciclo de polling sem mudança real.
- MarkerClusterGroup foi configurado para carregamento em blocos e remoção de marcadores fora da área visível. Em visão mundial, os pins são agrupados; ao aproximar o zoom, são individualizados.

### Testes desta alteração
- 12 arquivos TypeScript/TSX passaram por transpilation syntax check com TypeScript global; zero diagnósticos de sintaxe.
- `node --check` em funções Vercel, servidor e scripts `.mjs`: aprovado.
- `npm run test:brasil` (parser QuakeML, origem de dados e deduplicação sísmica já existente): aprovado.
- JSON de `package.json`, `tsconfig*.json` e `vercel.json`: válido.
- O ambiente desta sessão não contém `node_modules`; não foi possível fazer o typecheck completo de `tsc -b` nem um `vite build`. Fazer `npm ci` e `npm run build` no computador antes de publicar.
- A rede do ambiente de trabalho não resolveu DNS externo para `webservices.volcano.si.edu`; o WFS, observatórios e alertas não foram testados ao vivo nesta execução. Disponibilidade e dados reais devem ser verificados após deploy.

## 2026-11-17 — Cobertura vulcânica global e caldeiras especiais
- Reforcei a paginação WFS para catálogo Holoceno e Pleistoceno; se `numberMatched` exceder a primeira página, consulta páginas adicionais até limite defensivo de 20.000 por camada.
- Removi a dependência do catálogo Holoceno para iniciar a consulta Pleistoceno; cada camada pode ser carregada e recuperada de forma independente.
- Ampliei a assinatura visual do `MapView` para incluir nome, país, tipo, elevação e metadados de imagem, evitando popups desatualizados depois de revalidação do catálogo.
- Mantidos todos os registros Quaternários do GVP com coordenadas válidas (Holoceno + Pleistoceno); os pins são agrupados em visão mundial e individualizados com zoom.
- Supervulcões/grandes caldeiras destacados: Yellowstone, Long Valley, Toba e Taupo aparecem entre os exemplos citados pelo USGS de supervulcões/supererupções; Valles e Campi Flegrei são rotulados como grandes sistemas de caldeira sem afirmar VEI 8 confirmado; Aira e Aniakchak são grandes caldeiras candidatas/de interesse, também sem afirmar VEI 8 confirmado.
- Adicionados fallbacks coordenados independentes do GVP para os oito marcadores de destaque, para que apareçam mesmo se o catálogo remoto não tiver concluído o carregamento. A ficha GVP prevalece quando disponível.
- Polling dos alertas vulcânicos continua a cada 60 segundos em GVP WFS, USGS HANS, PHIVOLCS e PVMBG; o intervalo de consulta não altera a cadência de publicação das fontes.

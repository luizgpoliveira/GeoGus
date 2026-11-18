# Melhorias mobile e notificações — GeoGus

## Interface móvel
- A faixa técnica com nomes/estado das bases conectadas (`.statusbar`) fica oculta apenas em telas de até 760 px. No desktop ela continua disponível.
- O painel de listas inicia aberto no celular como bottom-sheet, com abas de terremotos, erupções e atualizações; a área interna tem rolagem própria. O botão de fechar continua disponível.
- O painel de atividade vulcânica foi reposicionado para ocupar o espaço logo abaixo da barra de busca.

## Notificações do telefone
- O app já pode mostrar notificações do sistema quando a permissão do navegador foi concedida e o GeoGus está ativo. A permissão deve ser solicitada pelo botão da Central de Notificações, por gesto do usuário.
- O service worker agora trata eventos `push` e mostra a notificação recebida mesmo com o app em segundo plano/fechado.
- **Limitação de infraestrutura:** receber push remoto exige ainda gerar/guardar chaves VAPID, criar e persistir a PushSubscription de cada instalação e um backend que envie mensagens push quando as fontes detectarem eventos. Essas credenciais e o serviço de envio não estão presentes neste pacote; portanto o listener está preparado, mas o push remoto ainda não está operacional.
- No iPhone, a entrega de push web requer que o GeoGus seja instalado na Tela de Início (PWA), iOS/iPadOS compatível e permissão concedida. Em navegador sem suporte, permanecem os avisos internos e a Central do app.

## Cache
- Service worker atualizado para `gg-sw-v10` para forçar a atualização dos recursos em instalações existentes.

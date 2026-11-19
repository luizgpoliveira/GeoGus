# Ajuste do filtro de período e pulsação de vulcões ativos

## Filtro de período

- O seletor de período fica visível quando `Terremotos` **ou** `Vulcões` estiver marcado.
- Ele desaparece somente quando as duas camadas estiverem desmarcadas.
- O filtro de magnitude permanece exclusivo da camada de terremotos.
- O período selecionado continua controlando a janela do feed sísmico. A classificação vulcânica usa as datas observadas nos boletins e os critérios de risco próprios; não usa a janela de terremotos como substituto da data de um boletim.

## Pulsação vulcânica

- Boletins oficiais confirmados com sinais de atividade recebem timestamp mesmo quando a categoria ainda não é reconhecida por uma regra específica de classificação. Isso permite que o sinal ativo pulse sem elevar automaticamente o nível além de amarelo.
- Sinais pontuais pulsam por até 24 horas após a evidência datada. Após esse prazo, o marcador mantém sua cor de risco, mas deixa de pulsar.
- Episódios eruptivos contínuos do GVP com `end` ausente são tratados como estado ativo atual e permanecem pulsando enquanto a fonte os mantiver em andamento, mesmo que a data inicial do episódio seja anterior a 24 horas.
- Um status geológico GVP `ATIVO` (erupção histórica recente) isoladamente não gera pulsação. Ele não comprova que o vulcão esteja em atividade operacional agora.
- Registros Pleistocenos continuam fora da classificação operacional e não pulsam.

## Testes

Execute `npm run test:precisao`. O conjunto inclui testes de visibilidade do seletor, atividade vulcânica datada, episódio eruptivo contínuo, expiração de pulsação e salvaguardas contra falsos alertas.

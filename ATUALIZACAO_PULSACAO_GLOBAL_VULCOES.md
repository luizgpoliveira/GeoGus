# Atualização — pulsação vulcânica global

## Alterações

- Marcadores vulcânicos laranja (ATENÇÃO) e vermelhos (PERIGO) agora mostram dois anéis circulares expansivos, no mesmo padrão visual de ondas sísmicas.
- A regra é independente da região e da fonte: USGS, PHIVOLCS, PVMBG, Smithsonian GVP e boletins oficiais.
- Supervulcões/grandes caldeiras que tenham risco laranja/vermelho também recebem os anéis.
- O motor do mapa não exige o booleano derivado `risk.pulse` se já existir timestamp de evidência válido nas últimas 24 horas.
- Se um observatório reporta nível oficial elevado sem informar timestamp, o estado oficial corrente é tratado como ativo enquanto continuar presente no feed; nenhum horário de coleta é apresentado como horário do fenômeno.
- Evidências datadas com mais de 24 horas mantêm a classificação, mas deixam de pulsar.
- Estados correntes confirmados pelo GVP/estado `ERUPCAO` continuam pulsando enquanto a fonte os mantiver abertos.

## Testes

`npm run test:precisao` valida os níveis e as janelas temporais. Os testes de pulsação também verificam seletores CSS dos anéis laranja/vermelhos.

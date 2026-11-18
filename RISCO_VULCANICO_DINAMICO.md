# GeoGus — classificação operacional dinâmica de risco vulcânico

## Objetivo e semântica visual

A camada de risco do GeoGus combina códigos oficiais dos observatórios, boletins oficiais recentes e uma análise auxiliar da sismicidade do entorno. Ela não substitui o nível emitido pelo observatório nem constitui previsão de erupção.

| Cor | Significado operacional GeoGus | Marcador |
|---|---|---|
| Verde | Nenhum sinal acima do padrão foi identificado nas fontes disponíveis. | Estático, sem pulsação |
| Amarelo | Aviso: agitação acima do normal, como sismicidade próxima em aumento, gases, vapor, deformação, cinzas ou inquietação reportada. | Pulsa lentamente |
| Laranja | Atenção: alerta oficial alto, erupção moderada/em curso, lava/explosividade/lahar reportado oficialmente, ou enxame sísmico local raso em aumento. | Pulsa mais rapidamente |
| Vermelho | Perigo: nível oficial máximo/perigo iminente ou em curso, fluxo piroclástico/PDC confirmado, ou evidência confirmada de emissão significativa de cinzas. | Pulsa fortemente e com brilho |

Marcadores verdes não pulsam. Supervulcões seguem a mesma classificação operacional, sem serem automaticamente colocados em alerta por sua classificação geológica.

## Mapeamento de códigos oficiais

- **USGS (perigo ao solo):** NORMAL → verde; ADVISORY → amarelo; WATCH → laranja; WARNING → laranja no GeoGus até que exista evidência separada de cinzas significativas. O nível de perigo ao solo WARNING, sozinho, não prova que há grande emissão de cinzas na atmosfera.
- **USGS (aviação/cinzas):** GREEN → verde; YELLOW → amarelo; ORANGE → laranja; RED → vermelho. O código de aviação e o nível de perigo ao solo são campos distintos; o GeoGus os interpreta em conjunto. Um código de aviação RED eleva para vermelho; por exemplo WATCH / RED e WARNING / RED indicam emissão significativa de cinzas. WARNING / ORANGE continua laranja.
- **PHIVOLCS:** nível 0 → verde; 1–2 → amarelo; 3–4 → laranja; 5 → vermelho. O nível 4 descreve erupção iminente ou processo magmático/efusivo que pode evoluir; o nível 5 descreve erupção perigosa em curso com colunas carregadas de cinzas, colapso de domo, PDCs ou queda de cinzas generalizada.
- **PVMBG/MAGMA:** I (Normal) → verde; II (Waspada) → amarelo; III (Siaga) → laranja; IV (Awas) → vermelho.

Os detalhes de boletins oficiais também são examinados. Termos positivos associados a SO₂/gases, tremor vulcânico, terremotos, deformação, inflação, vapor ou pluma podem elevar um nível normal para amarelo, exceto quando o texto indica explicitamente ausência de anomalia/atividade.

## Sismicidade auxiliar

- A janela de cálculo é de 7 dias, com magnitude mínima de 1.0, usando os eventos de catálogos sísmicos que o GeoGus consegue consultar.
- Eventos são relacionados ao centro de coordenadas do vulcão no catálogo GVP, em até 15 km; para enxames locais, utiliza-se também o raio de 10 km.
- A taxa das últimas 24 horas é comparada com os 6 dias anteriores.
- **Amarelo:** aumento significativo da frequência (pelo menos 3 eventos no dia e 2,5 vezes a média diária anterior), ou evento M≥3.5 a até 10 km, ou aumento de pelo menos 2 eventos M≥2 a até 10 km em relação à linha de base.
- **Laranja:** pelo menos 6 eventos a até 10 km nas últimas 24 horas, pelo menos 60% com profundidade de até 20 km, e taxa local pelo menos 2,5 vezes a média diária dos 6 dias anteriores.
- **Vermelho nunca é atribuído somente por terremotos.** Um enxame sísmico pode ser tectônico; o nível vermelho exige evidência oficial/confirmada de perigo eruptivo.

## Boletins e relatórios

São considerados boletins oficiais confirmados dos últimos 48 h, ligados ao número de vulcão do GVP:

- **Amarelo:** sinais de gases, inquietação, sismicidade, incandescência ou cinzas sem evidência de perigo elevado.
- **Laranja:** atividade eruptiva/efusiva confirmada, erupção moderada, lava, explosividade ou lahar.
- **Vermelho:** fluxo piroclástico/PDC, explosão lateral, colapso destrutivo de domo ou cinzas significativas/coluna alta (por exemplo, pluma reportada com altura ≥10 km associada a erupção).
- Notícias isoladas/reportadas não alteram sozinhas a cor. Duas ou mais fontes jornalísticas independentes que identifiquem o mesmo vulcão e publiquem sinais categorizados em 48 h podem apoiar amarelo; notícias não criam laranja/vermelho. Relatórios oficiais confirmados podem sustentar a classificação conforme seus sinais.

A flag de erupção contínua do GVP sustenta pelo menos laranja, mas o VEI histórico/máximo isoladamente não é tratado como prova de emissão significativa de cinzas no momento.

## Limitações importantes

1. Catálogos globais não incluem todos os microssismos, tremor harmônico, eventos de longo período ou sinais instrumentais locais. O mínimo M1.0 significa que a camada pode não enxergar a sismicidade mais fraca.
2. O raio é medido a partir das coordenadas do catálogo GVP; não equivale a uma rede local de estações sísmicas nem prova que o evento tenha origem magmática.
3. Nem todos os vulcões possuem boletins oficiais atualizados ou dados de gases/deformação disponíveis publicamente.
4. Verde significa **“nenhum sinal encontrado nas fontes consultadas”**, não “vulcão garantidamente seguro”.
5. Níveis e códigos nacionais têm definições próprias. O mapeamento para as quatro cores do GeoGus é uma camada de triagem visual, não uma conversão oficial universal.

## Referências

- USGS — Alert Level Icons (ground alert + aviation color combinations): https://www.usgs.gov/programs/VHP/alert-level-icons
- USGS — Alert Level System: https://www.usgs.gov/programs/VHP/alert-level-system
- PHIVOLCS — Volcano Alert Levels: https://www.phivolcs.dost.gov.ph/volcano-alert-levels/
- BNPB — referência pública para os níveis PVMBG (Normal/Waspada/Siaga/Awas): https://bnpb.go.id/storage/app/media/uploads/migration/pubs/478.pdf

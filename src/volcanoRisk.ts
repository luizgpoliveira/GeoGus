import type { AlertInfo, Quake, ReportItem, Volcano, VolcanoRiskAssessment, VolcanoRiskLevel } from './types';

const DAY = 24 * 60 * 60_000;

function sourceTimestamp(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}
const COLORS: Record<VolcanoRiskLevel, string> = {
  GREEN: '#22c55e',
  YELLOW: '#facc15',
  ORANGE: '#f97316',
  RED: '#ef4444',
};
const LABELS: Record<VolcanoRiskLevel, string> = {
  GREEN: 'NORMAL',
  YELLOW: 'AVISO',
  ORANGE: 'ATENÇÃO',
  RED: 'PERIGO',
};
const RANK: Record<VolcanoRiskLevel, 0 | 1 | 2 | 3> = {
  GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3,
};

function norm(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[₀-₉]/g, (digit) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit))).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function numericLevel(value: unknown): number | null {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const normalized = norm(value);
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  if (roman[normalized] != null) return roman[normalized];
  // Tolerates source labels such as "Alert Level 2", "Level III" or "PVMBG IV".
  const numericMatch = normalized.match(/(?:ALERTLEVEL|LEVEL|TINGKAT|STATUS)?([0-5])(?:$|[^0-9])/);
  if (numericMatch) return Number(numericMatch[1]);
  const romanMatch = normalized.match(/^(?:ALERTLEVEL|LEVEL|TINGKAT|STATUS|PVMBG|MAGMA|PHIVOLCS)?(IV|III|II|V|I)(?:$|[A-Z])/);
  return romanMatch ? roman[romanMatch[1]] : null;
}

function detailsSignal(alert: AlertInfo): string | null {
  const raw = String(alert.details || '');
  const text = norm(raw);
  if (!text) return null;
  // Explicit negative statements must not trigger an alert by keyword alone.
  if (/NO(UNUSUAL|SIGNIFICANT|INCREASE|INCREASED|VOLCANIC|SULFUR|SULPHUR|SO2|GAS|ASH)|WITHINNORMAL|NORMALLEVEL|NONEDETECTED|NOTDETECTED|SEMALTERACAO|SEMREGISTRO|NAOHOUVE/.test(text)) return null;
  if (/SO2|SULFURDIOXIDE|SULPHURDIOXIDE|GAS(EMISSION|ES)|GASES|STEAMPLUME|GASPLUME|INCREASEDSEISMIC|VOLCANICTREMOR|EARTHQUAKE|DEFORMATION|INFLATION|ASHPLUME|ASHEMISSION|CINZAS|ENXAMESISMICO|TREMOR/.test(text)) return raw;
  return null;
}

function levelFromAlert(alert: AlertInfo): { level: VolcanoRiskLevel; reason: string } | null {
  const value = norm(alert.level);
  let rank: number | null = null;
  let detail = `${alert.source}: nível ${alert.level}`;

  if (alert.source === 'USGS') {
    // USGS separates ground-hazard Alert Level from the aviation ash code.
    // They are both retained because a volcano can legitimately have different
    // ground and aviation statuses at the same time.
    // Ground WARNING is high concern, but does not alone prove significant
    // ash in the atmosphere. Under the GeoGus visual contract it maps to
    // ORANGE unless the separate aviation code is RED.
    const ground: Record<string, number> = { NORMAL: 0, ADVISORY: 1, WATCH: 2, WARNING: 2 };
    const groundLabel = value.match(/(NORMAL|ADVISORY|WATCH|WARNING)$/)?.[1] ?? value;
    rank = ground[groundLabel] ?? null;
    const aviationCode = norm(alert.colorCode);
    const aviationLabel = aviationCode.match(/(GREEN|YELLOW|ORANGE|RED)$/)?.[1] ?? aviationCode;
    const aviation: Record<string, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
    const ashRank = aviation[aviationLabel] ?? null;
    if (ashRank != null && (rank == null || ashRank > rank)) {
      rank = ashRank;
      detail += ` · código de aviação ${aviationLabel}`;
    } else if (alert.colorCode) {
      detail += ` · aviação ${aviationLabel}`;
    }
  } else if (alert.source === 'PHIVOLCS') {
    // PHIVOLCS: 0 quiet, 1–2 low/moderate unrest, 3 high unrest,
    // 4 hazardous eruption imminent, 5 hazardous eruption in progress.
    const n = numericLevel(alert.level);
    rank = n == null ? null : n <= 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
  } else if (alert.source === 'PVMBG') {
    // PVMBG MAGMA: I/NORMAL, II/WASPADA, III/SIAGA, IV/AWAS.
    // Algumas respostas do observatório trazem o nome indonésio em vez do numeral.
    const labelRanks: Record<string, number> = { NORMAL: 1, WASPADA: 2, SIAGA: 3, AWAS: 4 };
    const n = numericLevel(alert.level) ?? labelRanks[value] ?? null;
    rank = n == null ? null : n <= 1 ? 0 : n === 2 ? 1 : n === 3 ? 2 : 3;
  }
  if (rank == null) return null;
  const fieldSignal = detailsSignal(alert);
  if (fieldSignal && rank === 0) {
    rank = 1;
    detail += ' · sinais adicionais no boletim: ' + fieldSignal.slice(0, 180);
  }
  const level: VolcanoRiskLevel = rank >= 3 ? 'RED' : rank === 2 ? 'ORANGE' : rank === 1 ? 'YELLOW' : 'GREEN';
  return { level, reason: detail };
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

function seismicSignal(volcano: Volcano, quakes: Quake[], now: number) {
  const cutoff24 = now - DAY;
  const cutoff7d = now - 7 * DAY;
  const local = quakes.filter((q) => Number.isFinite(q.time)
    && q.time >= cutoff7d && q.time <= now + 60_000
    && Number.isFinite(q.lat) && Number.isFinite(q.lon)
    && distanceKm(volcano.lat, volcano.lon, q.lat, q.lon) <= 15);
  const recent = local.filter((q) => q.time >= cutoff24);
  const previous = local.filter((q) => q.time < cutoff24);
  const within10 = recent.filter((q) => distanceKm(volcano.lat, volcano.lon, q.lat, q.lon) <= 10);
  const previousWithin10 = previous.filter((q) => distanceKm(volcano.lat, volcano.lon, q.lat, q.lon) <= 10);
  const shallow = within10.filter((q) => Number(q.depthKm) <= 20).length;
  const priorDailyAverage = previous.length / 6;
  const priorCloseDailyAverage = previousWithin10.length / 6;
  const increased = recent.length >= 3 && recent.length >= Math.max(3, priorDailyAverage * 2.5);
  const closeIncreased = within10.length >= 4 && within10.length >= Math.max(4, priorCloseDailyAverage * 2.5);
  const shallowRatio = within10.length ? shallow / within10.length : 0;
  const moderateClose = within10.filter((q) => q.mag >= 2.0);
  const strongClose = within10.filter((q) => q.mag >= 3.5);
  const moderateCloseIncreased = moderateClose.length >= 2
    && moderateClose.length >= Math.max(2, priorCloseDailyAverage * 2.5);

  // Orange needs a clearly unusual, close and predominantly shallow swarm.
  // Regional earthquake counts without a baseline increase are insufficient.
  const orange = within10.length >= 6 && shallowRatio >= 0.6 && closeIncreased;
  // Yellow requires a measurable rate increase or a small swarm of nearby
  // events. A single earthquake, even if felt, may be tectonic and is not
  // sufficient on its own to recolor a volcano.
  const clusteredStrongClose = strongClose.length >= 2 && shallowRatio >= 0.5;
  const yellow = !orange && (
    increased
    || clusteredStrongClose
    || moderateCloseIncreased
  );
  const reasons: string[] = [];
  const signalEvents = orange ? within10
    : yellow ? (strongClose.length ? strongClose : moderateCloseIncreased ? moderateClose : recent)
      : [];
  const activityAt = signalEvents.reduce<number | null>((latest, q) => latest == null || q.time > latest ? q.time : latest, null);
  if (orange) reasons.push(`Enxame sísmico raso e em crescimento: ${within10.length} evento(s) a até 10 km nas últimas 24 h; ${shallow} raso(s) (≤20 km), acima da frequência dos 6 dias anteriores.`);
  else if (yellow) reasons.push(`Sismicidade próxima acima do critério de atenção: ${recent.length} evento(s) a até 15 km nas últimas 24 h; ${previous.length} nos 6 dias anteriores; ${moderateClose.length} evento(s) M≥2 a até 10 km (${previousWithin10.length} nos 6 dias anteriores).`);
  if (recent.length) reasons.push('Terremotos próximos são um sinal de monitoramento, mas não comprovam, isoladamente, origem magmática.');
  return {
    level: orange ? 'ORANGE' as const : yellow ? 'YELLOW' as const : 'GREEN' as const,
    reasons,
    recentCount: recent.length,
    previousCount: previous.length,
    activityAt,
  };
}

function reportSignal(volcano: Volcano, reports: ReportItem[], now: number) {
  const related = reports.filter((item) => Number(item.volcanoVn) === Number(volcano.vn)
    && item.ts <= now + 60 * 60_000 && now - item.ts <= 48 * 60 * 60_000
    && item.verified !== 'NAO_CONFIRMADO');
  const official = related.filter((item) => item.kind === 'OFICIAL' && item.verified === 'CONFIRMADO');
  const news = related.filter((item) => item.kind === 'NOTICIA' && item.verified === 'REPORTADO');
  let rank = 0;
  const reasons: string[] = [];
  const sources = new Set<string>();
  const activityTimes: number[] = [];

  for (const item of official) {
    const cats = new Set((item.cats || []).map((cat) => norm(cat))); // remove acentos, espaços e underscores
    const text = `${item.title || ''} ${item.text || ''}`;
    const normalized = norm(text);
    const ashKm = Number(item.ashKm);
    const eruption = cats.has('ERUPCAO') || cats.has('ERUPCAOMODERADA') || /ERUPT(ION|ING)|ERUPSI|LETUSAN/.test(normalized);
    const pdcTerms = /PYROCLASTICFLOW|PYROCLASTICDENSITYCURRENT|PDC|FLUXOPIROCLASTICO|FLUJOPIROCLASTICO|AWANPANAS/;
    const pdcAction = /OBSERVED|DETECTED|REPORTED|OCCURRED|OCCURRING|GENERATED|DESCENDED|REACHED|RECORDED|EMPLACED|FLOWED|MOVING|CONTINUES|CONTINUING|ONGOING|ACTIVE|UNDERWAY|TERJADI|TERAMATI|TERDETEKSI|MENGALIR|MELUNCUR/;
    const pdcNegated = /(?:NO|WITHOUT|NOTOBSERVED|NOTDETECTED|NOEVIDENCEOF)[A-Z0-9]{0,32}(?:PYROCLASTIC|PDC|AWANPANAS)|(?:PYROCLASTICFLOW|PYROCLASTICDENSITYCURRENT|PDC|FLUXOPIROCLASTICO|FLUJOPIROCLASTICO)[A-Z0-9]{0,32}(?:NOTOBSERVED|NOTDETECTED|DIDNOTOCCUR)/.test(normalized);
    // A categoria PIROCLASTICO pode aparecer em texto de contexto/precaução.
    // Para RED, exigimos que o boletim confirmado descreva o fenômeno no texto.
    const pdc = pdcTerms.test(normalized) && pdcAction.test(normalized) && !pdcNegated;
    const ashTerms = /SIGNIFICANTASH|LARGEASHCOLUMN|TALLASHCOLUMN|WIDESPREADASHFALL|HEAVYASHFALL|MAJORASHPLUME/;
    const ashNegated = /(?:NO|WITHOUT|NOTOBSERVED|NOTDETECTED|NOEVIDENCEOF)[A-Z0-9]{0,32}(?:SIGNIFICANTASH|LARGEASHCOLUMN|TALLASHCOLUMN|WIDESPREADASHFALL|HEAVYASHFALL|MAJORASHPLUME)/.test(normalized);
    const significantAsh = (cats.has('CINZAS') && Number.isFinite(ashKm) && ashKm >= 6 && eruption)
      || (ashTerms.test(normalized) && !ashNegated);
    const severeGround = /LATERALBLAST|MASSIVEDOMECOLLAPSE|DEADLYPYROCLASTIC|DESTRUCTIVEPYROCLASTIC/.test(normalized)
      && !/(?:NO|WITHOUT|NOTOBSERVED|NOTDETECTED|NOEVIDENCEOF)[A-Z0-9]{0,32}(?:LATERALBLAST|MASSIVEDOMECOLLAPSE|DEADLYPYROCLASTIC|DESTRUCTIVEPYROCLASTIC)/.test(normalized);
    // Erupção explosiva explicitamente descrita como violenta/major/paroxística
    // em boletim confirmado é sinal RED, sem inferir gravidade de uma palavra isolada.
    const majorEruption = /(?:VIOLENT|MAJOR|LARGE|HIGHINTENSITY|PAROXYSMAL|CATACLYSMIC|PLINIANTYPE)(?:EXPLOSIVE)?ERUPTION|ERUPTION(?:IS|WAS|HASBEEN|UNDERWAY)[A-Z]{0,12}(?:VIOLENT|MAJOR|LARGE|PAROXYSMAL)|ERUPSI(?:BESAR|DAHSYAT|KUAT)|LETUSAN(?:BESAR|DAHSYAT)/.test(normalized)
      && !/(?:NO|WITHOUT|NOT|NEVER|TIDAK|BELUM)[A-Z0-9]{0,35}(?:VIOLENT|MAJOR|LARGE|PAROXYSMAL|DAHSYAT|BESAR)/.test(normalized);

    if (significantAsh || pdc || severeGround || majorEruption) {
      rank = Math.max(rank, 3);
      reasons.push(`${item.source}: sinal de perigo elevado (${pdc ? 'fluxo piroclástico/PDC' : significantAsh ? 'cinzas significativas ou coluna de erupção' : 'perigo eruptivo severo'}).`);
      sources.add(item.source);
      if (Number.isFinite(Number(item.ts))) activityTimes.push(Number(item.ts));
    } else if (eruption || cats.has('ERUPCAOMODERADA') || cats.has('LAVA') || cats.has('EXPLOSIVA') || cats.has('LAHAR')) {
      rank = Math.max(rank, 2);
      reasons.push(`${item.source}: atividade eruptiva/efusiva confirmada ou perigo vulcânico em curso.`);
      sources.add(item.source);
      if (Number.isFinite(Number(item.ts))) activityTimes.push(Number(item.ts));
    } else if (cats.has('SISMICIDADE') || cats.has('GASES') || cats.has('INQUIETACAO') || cats.has('CINZAS') || cats.has('INCANDESCENCIA') || cats.has('PIROCLASTICO')) {
      rank = Math.max(rank, 1);
      const signs = [...cats].filter((cat) => ['SISMICIDADE', 'GASES', 'INQUIETACAO', 'CINZAS', 'INCANDESCENCIA', 'PIROCLASTICO'].includes(cat)).join(', ');
      reasons.push(`${item.source}: sinais de agitação/monitoramento (${signs}).`);
      sources.add(item.source);
      if (Number.isFinite(Number(item.ts))) activityTimes.push(Number(item.ts));
    }
  }

  // News can support a low-confidence YELLOW signal only when at least two
  // independent publishers report the same named volcano in the 48 h window.
  const independentNews = new Set(news.map((item) => item.source).filter(Boolean));
  if (rank < 1 && independentNews.size >= 2 && news.some((item) => (item.cats || []).length > 0)) {
    rank = 1;
    reasons.push(`Atualizações de ${independentNews.size} fontes jornalísticas independentes; sinal não confirmado por observatório.`);
    independentNews.forEach((source) => sources.add(source));
    // Timestamp de publicação jornalística não é necessariamente a hora do evento;
    // notícias podem contextualizar YELLOW, mas não ativam pulsação temporal.
  }
  return { rank, reasons, sources: [...sources], activityAt: activityTimes.length ? Math.max(...activityTimes) : null };
}

export interface VolcanoRiskInput {
  quakes: Quake[];
  reports: ReportItem[];
  ongoing?: { start: string; end: string | null; vei: number | null } | null;
  now?: number;
}

/**
 * Classificação operacional GeoGus. Não substitui o nível oficial emitido pelo
 * observatório; combina alertas oficiais, boletins confirmados e sismicidade
 * regional disponível para priorizar visualmente os vulcões no mapa.
 */
export function assessVolcanoRisk(volcano: Volcano, input: VolcanoRiskInput): VolcanoRiskAssessment {
  const now = input.now ?? Date.now();
  if (!volcano.holocene) {
    return { level: 'GREEN', rank: 0, label: LABELS.GREEN, color: COLORS.GREEN, pulse: false,
      reasons: ['Registro do catálogo Pleistoceno; não usado como vulcão operacional atual.'], sources: ['Smithsonian GVP'],
      seismic24h: 0, seismicPrevious6d: 0, seismicRadiusKm: 15, confidence: 'LIMITADA', activityAt: null, continuing: false, updatedAt: now };
  }

  const reasons: string[] = [];
  const sources = new Set<string>();
  let rank = 0;
  const activityTimes: number[] = [];
  const alerts = volcano.alertInfos?.length ? volcano.alertInfos : volcano.alertInfo ? [volcano.alertInfo] : [];
  // Alguns observatórios publicam um nível de alerta ativo sem data do boletim.
  // Nesse caso o próprio estado atual da fonte é a evidência: manter a pulsação
  // enquanto o alerta elevado continuar no feed, sem inventar timestamp.
  let undatedElevatedOfficialAlert = false;
  for (const alert of alerts) {
    const signal = levelFromAlert(alert);
    if (!signal) continue;
    const n = RANK[signal.level];
    if (n > rank) rank = n;
    if (n > 0) {
      reasons.push(signal.reason);
      sources.add(alert.source);
      const timestamp = sourceTimestamp(alert.noticeTime);
      if (timestamp != null) activityTimes.push(timestamp);
      else if (n >= 2) undatedElevatedOfficialAlert = true;
    }
  }

  const report = reportSignal(volcano, input.reports || [], now);
  rank = Math.max(rank, report.rank);
  report.reasons.forEach((reason) => reasons.push(reason));
  report.sources.forEach((source) => sources.add(source));
  if (report.activityAt != null) activityTimes.push(report.activityAt);

  const seismic = seismicSignal(volcano, input.quakes || [], now);
  const seismicRank = RANK[seismic.level];
  rank = Math.max(rank, seismicRank);
  seismic.reasons.forEach((reason) => reasons.push(reason));
  if (seismicRank > 0) {
    sources.add('Catálogos sísmicos multiorigem');
    if (seismic.activityAt != null) activityTimes.push(seismic.activityAt);
  }

  // A flag GVP de erupção contínua é evidência de erupção em andamento,
  // mas VEI histórico/máximo não é confundido com emissão atual de cinzas.
  if (input.ongoing && rank < 2) {
    rank = 2;
    reasons.push(`Smithsonian GVP: erupção contínua registrada desde ${input.ongoing.start || 'data não especificada'}; sem evidência suficiente de emissão significativa de cinzas.`);
    sources.add('Smithsonian GVP');
  }
  // O VEI é usado aqui somente quando pertence ao episódio atualmente marcado
  // como contínuo pelo GVP. VEI histórico/máximo de catálogo inativo nunca eleva risco.
  if (input.ongoing && Number.isFinite(Number(input.ongoing.vei)) && Number(input.ongoing.vei) >= 4) {
    rank = Math.max(rank, 3);
    reasons.push(`Smithsonian GVP: episódio eruptivo contínuo atual com VEI ${Number(input.ongoing.vei)} (explosividade elevada).`);
    sources.add('Smithsonian GVP · erupção contínua e VEI do episódio');
  }
  if (input.ongoing) {
    const startAt = sourceTimestamp(input.ongoing.start);
    if (startAt != null) activityTimes.push(startAt);
  }
  if (!input.ongoing && volcano.status === 'ERUPCAO' && rank < 2) {
    rank = 2;
    reasons.push('Erupção em andamento confirmada no conjunto de dados GeoGus; sem evidência suficiente para nível vermelho.');
    sources.add('GeoGus / fontes vulcânicas');
  }

  // activity[] is generated from 48 h report tags. It is a safety net for a
  // newly recognized tag but can never elevate to ORANGE/RED by itself.
  // Preserve the timestamp of the latest matching official, confirmed bulletin
  // even when its tag is newer than the parser's explicit category rules.
  const activityCategories = new Set([
    'ERUPCAO', 'ERUPCAOMODERADA', 'LAVA', 'EXPLOSIVA', 'LAHAR',
    'SISMICIDADE', 'GASES', 'INQUIETACAO', 'CINZAS', 'INCANDESCENCIA',
    'PIROCLASTICO', 'DEFORMACAO', 'EMISSAODECINZAS', 'FLUXOPIROCLASTICO',
  ]);
  const latestTaggedOfficialActivityAt = (input.reports || []).reduce<number | null>((latest, item) => {
    const hasActivityTag = Array.isArray(item.cats) && item.cats.some((cat) => activityCategories.has(norm(cat)));
    if (Number(item.volcanoVn) !== Number(volcano.vn)
      || item.kind !== 'OFICIAL' || item.verified !== 'CONFIRMADO'
      || !hasActivityTag || !Number.isFinite(Number(item.ts))
      || item.ts > now + 60 * 60_000 || now - item.ts > 48 * 60 * 60_000) return latest;
    return latest == null || item.ts > latest ? item.ts : latest;
  }, null);

  if (rank === 0 && (volcano.activity || []).length) {
    rank = 1;
    reasons.push(`Atualização recente de atividade: ${(volcano.activity || []).slice(0, 4).join(', ')}.`);
    sources.add('Central de Inteligência GeoGus');
  }
  if ((volcano.activity || []).length && latestTaggedOfficialActivityAt != null) {
    activityTimes.push(latestTaggedOfficialActivityAt);
  }

  const level: VolcanoRiskLevel = rank >= 3 ? 'RED' : rank === 2 ? 'ORANGE' : rank === 1 ? 'YELLOW' : 'GREEN';
  const activityAt = activityTimes.length ? Math.max(...activityTimes) : null;
  // Um episódio GVP aberto, um estado de erupção corrente já classificado
  // pelo catálogo ou um alerta oficial elevado sem data explícita representam
  // estados ainda ativos e continuam pulsando enquanto a fonte os mantiver.
  // Para evidências episódicas com data, a pulsação expira após 24 h.
  const confirmedOngoing = Boolean(
    (input.ongoing && !input.ongoing.end)
    || volcano.status === 'ERUPCAO'
    || undatedElevatedOfficialAlert,
  );
  const pulse = level !== 'GREEN' && (confirmedOngoing
    || (activityAt != null && activityAt >= now - DAY && activityAt <= now + 60_000));
  if (level === 'GREEN') reasons.push('Nenhum sinal acima do padrão foi identificado nas fontes disponíveis. Verde não significa ausência absoluta de risco, especialmente onde não há monitoramento instrumental local.');
  const confidence: VolcanoRiskAssessment['confidence'] =
    sources.has('PHIVOLCS') || sources.has('PVMBG') || sources.has('USGS')
      ? 'ALTA'
      : seismicRank > 0 ? 'LIMITADA' : sources.size > 0 ? 'MODERADA' : 'LIMITADA';
  const uniqueReasons = [...new Set(reasons)].slice(0, 6);
  return {
    level, rank: RANK[level], label: LABELS[level], color: COLORS[level], pulse, activityAt,
    continuing: confirmedOngoing,
    reasons: uniqueReasons, sources: [...sources], seismic24h: seismic.recentCount,
    seismicPrevious6d: seismic.previousCount, seismicRadiusKm: 15, confidence, updatedAt: now,
  };
}

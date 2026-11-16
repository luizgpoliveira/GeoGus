import type { Quake, Volcano, VolcanoStatus, Period, AlertInfo, ReportItem, ReportsPayload } from './types';

/* ============================ GVP (Smithsonian) — via proxy /api/gvp ============================
 * Fontes oficiais:
 *  - https://volcano.si.edu (Global Volcanism Program)
 *  - WFS: https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs (OGC WFS 2.0.0)
 * Camadas usadas:
 *  - E3WebApp_HoloceneVolcanoes        (catálogo Holoceno, ~1.214 vulcões)
 *  - Smithsonian_VOTW_Pleistocene_Volcanoes
 *  - E3WebApp_Eruptions1960           (erupções desde 1960, com flag ContinuingEruption)
 *  - Smithsonian_VOTW_Holocene_Eruptions (histórico completo do Holoceno)
 * O GVP não envia CORS; o servidor local (server/server.mjs) faz proxy com cache.
 */

const WFS = '';
const VP_LAY = 'GVP-VOTW:E3WebApp_HoloceneVolcanoes';
const PLEIST_LAY = 'GVP-VOTW:Smithsonian_VOTW_Pleistocene_Volcanoes';
const ER1960_LAY = 'GVP-VOTW:E3WebApp_Eruptions1960';
const ER_HOL_LAY = 'GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions';

const VP_PROPS = 'VolcanoNumber,VolcanoName,Country,VolcanoType,LastEruption,Elevation,LatitudeDecimal,LongitudeDecimal,Within_5km,Within_10km,Within_30km,Within_100km,VPImageFileName,VPImageCaption,VPImageCredit';

/** Busca JSON com timeout que cobre conexão E leitura do corpo da resposta. */
async function fetchJsonT<T = any>(url: string, ms: number, endpoint: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const looksJson = /application\/(?:[a-z0-9.+-]*\+)?json/i.test(contentType) || /^[\s]*[\[{]/.test(body);
    if (!looksJson) {
      const detail = body.trimStart().startsWith('<')
        ? 'o servidor retornou HTML em vez de JSON; confirme o backend e o proxy /api.'
        : `Content-Type recebido: ${contentType || 'não informado'}.`;
      throw new Error(`${endpoint}: resposta inválida (HTTP ${response.status}); ${detail}`);
    }
    let data: any;
    try { data = JSON.parse(body); }
    catch { throw new Error(`${endpoint}: o servidor declarou JSON, mas retornou conteúdo inválido.`); }
    if (!response.ok) throw new Error(data?.error || `${endpoint}: HTTP ${response.status}`);
    return data as T;
  } catch (error: any) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`${endpoint}: tempo limite excedido após ${Math.ceil(ms / 1000)}s.`);
    }
    throw error;
  } finally { window.clearTimeout(timer); }
}

export const GVP_PAGE = (vn: number) => `https://volcano.si.edu/volcano.cfm?vn=${vn}`;

async function gvpGet(params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams(params).toString();
  return fetchJsonT<any>(`/api/gvp?q=${encodeURIComponent(q)}`, 13_000, 'Smithsonian GVP');
}

const gvpQuery = (o: Record<string, string | number>) =>
  gvpGet({ service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', ...o });

export interface AlertMaps {
  hans: Map<number, AlertInfo>;      // chave = vn (GVP VolcanoNumber)
  phivolcs: Map<string, AlertInfo>;  // chave = nome normalizado
  pvmbg: Map<string, AlertInfo>;
}

const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Variações de nome p/ cruzar GVP ↔ observatórios (Anak Krakatau↔Krakatau, Lewotobi Laki-laki↔Lewotobi…). */
const nameVariants = (s: string): string[] => {
  const n = normName(s);
  return [...new Set([n, n.replace(/^anak/, ''), n.replace(/lakilaki$/, ''), normName(s.replace(/^anak\s+/i, '')).replace(/lakilaki$/, '')])].filter(Boolean);
};

const insertAliased = (m: Map<string, AlertInfo>, name: string, info: AlertInfo) => {
  for (const k of nameVariants(name)) m.set(k, info);
};

function obsByName(m: Map<string, AlertInfo> | undefined, name: string): AlertInfo | undefined {
  if (!m) return undefined;
  for (const k of nameVariants(name)) {
    const hit = m.get(k);
    if (hit) return hit;
  }
  return undefined;
}

export function classifyVolcano(
  v: Omit<Volcano, 'status'>, ongoingVNs: Set<number>, activeVNs: Set<number>,
  recentVNs: Set<number> = new Set(), alerts?: AlertMaps,
): Volcano {
  // Defesa de domínio: entradas do catálogo Pleistoceno são históricas e
  // nunca podem ser promovidas a erupção atual por colisão de VN, relatório
  // legado ou associação de alertas de observatórios.
  if (!v.holocene) return { ...v, status: 'EXTINTO', alertInfo: undefined };

  const obs: AlertInfo[] = [];
  const hans = alerts?.hans.get(v.vn);
  if (hans) obs.push(hans);
  const phiv = obsByName(alerts?.phivolcs, v.name);
  if (phiv) obs.push(phiv);
  const pvmbg = obsByName(alerts?.pvmbg, v.name);
  if (pvmbg) obs.push(pvmbg);

  // Nível de alerta não é, por si só, confirmação de erupção.
  // USGS WATCH/WARNING, PHIVOLCS 3/4 e PVMBG III/IV indicam perigo/alerta,
  // mas só classificamos erupção quando o GVP marca atividade contínua ou
  // quando um boletim oficial recente descreve explicitamente erupção em curso.
  const alertInfo = obs[0];

  let status: VolcanoStatus = 'INDEFINIDO';
  if (ongoingVNs.has(v.vn)) status = 'ERUPCAO';
  else if (recentVNs.has(v.vn)) status = 'RECENTE';
  else if (!v.holocene) status = 'EXTINTO';
  else if (activeVNs.has(v.vn) || (v.lastEruption != null && v.lastEruption >= new Date().getFullYear() - 50)) status = 'ATIVO';
  else status = 'DORMENTE';
  return { ...v, status, alertInfo };
}

const num = (x: any) => (x == null ? null : Number(x));

const fmtYYYYMMDD = (s: any) => {
  if (!s) return null;
  const str = String(s);
  if (str.length >= 8) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  return str;
};

export interface EruptionInfo { start: string; end: string | null; vei: number | null }
export interface EruptionSet { ongoing: Map<number, EruptionInfo>; stamp: string | null }

/** Vulcões com erupção em curso segundo o GVP (flag ContinuingEruption) + stamp do WFS. */
export async function loadOngoingEruptions(): Promise<EruptionSet> {
  const j = await gvpQuery({ typeNames: ER1960_LAY, count: '200', cql_filter: "ContinuingEruption='True'" });
  const map = new Map<number, EruptionInfo>();
  for (const f of j.features ?? []) {
    const p = f.properties || {};
    map.set(p.VolcanoNumber, { start: fmtYYYYMMDD(p.StartDate) ?? String(p.StartDateYear ?? ''), end: fmtYYYYMMDD(p.EndDate), vei: num(p.ExplosivityIndexMax) });
  }
  return { ongoing: map, stamp: j.timeStamp ?? null };
}

/** Erupções recentemente encerradas (últimos N dias, datas oficiais do GVP). */
export async function loadRecentEruptions(days = 90): Promise<Set<number>> {
  const since = new Date(Date.now() - days * 86400e3);
  const ymd = `${since.getFullYear()}${String(since.getMonth() + 1).padStart(2, '0')}${String(since.getDate()).padStart(2, '0')}`;
  const j = await gvpQuery({ typeNames: ER1960_LAY, count: '300', cql_filter: `EndDate > '${ymd}'` });
  const s = new Set<number>();
  for (const f of j.features ?? []) s.add(f.properties?.VolcanoNumber);
  return s;
}

function parseVolcano(f: any, holocene: boolean): Omit<Volcano, 'status'> | null {
  const p = f.properties || {};
  const lat = num(p.LatitudeDecimal ?? p.Latitude), lon = num(p.LongitudeDecimal ?? p.Longitude);
  if (lat == null || lon == null) return null;
  return {
    vn: p.VolcanoNumber ?? p.Volcano_Number,
    name: p.VolcanoName ?? p.Volcano_Name,
    country: p.Country || '—',
    type: p.VolcanoType ?? p.Primary_Volcano_Type ?? '—',
    lastEruption: num(p.LastEruption),
    elevation: num(p.Elevation),
    lat, lon,
    holocene,
    pop: holocene
      ? { p5: num(p.Within_5km), p10: num(p.Within_10km), p30: num(p.Within_30km), p100: num(p.Within_100km) }
      : undefined,
    image: holocene
      ? { file: p.VPImageFileName, caption: p.VPImageCaption, credit: p.VPImageCredit }
      : undefined,
  };
}

/** Catálogo completo (Holoceno + Pleistoceno) — chamado 1x, com cache do proxy. */
export async function loadVolcanoCatalog(): Promise<Omit<Volcano, 'status'>[]> {
  const [hol, ple] = await Promise.all([
    gvpQuery({ typeNames: VP_LAY, propertyName: VP_PROPS, count: '2000' }),
    gvpQuery({ typeNames: PLEIST_LAY, propertyName: 'Volcano_Number,Volcano_Name,Primary_Volcano_Type,Country,Latitude,Longitude,Elevation', count: '2000' }),
  ]);
  // Um mesmo VolcanoNumber pode aparecer em mais de uma camada do serviço.
  // Mantemos um único registro e damos precedência ao catálogo Holoceno para
  // impedir que uma linha Pleistocena duplique ou contamine a camada operacional.
  const byVolcanoNumber = new Map<number, Omit<Volcano, 'status'>>();
  for (const f of hol.features ?? []) {
    const v = parseVolcano(f, true);
    const vn = Number(v?.vn);
    if (v && Number.isFinite(vn) && vn > 0) byVolcanoNumber.set(vn, v);
  }
  for (const f of ple.features ?? []) {
    const v = parseVolcano(f, false);
    const vn = Number(v?.vn);
    if (v && Number.isFinite(vn) && vn > 0 && !byVolcanoNumber.has(vn)) byVolcanoNumber.set(vn, v);
  }
  const out = [...byVolcanoNumber.values()];
  if (!out.length) throw new Error('Catálogo GVP vazio ou indisponível');
  return out;
}

/** VNs com alguma erupção registrada desde 1960 (usado p/ status ATIVO). */
export async function loadActiveSince1960(): Promise<Set<number>> {
  const j = await gvpQuery({ typeNames: ER1960_LAY, count: '3000', propertyName: 'VolcanoNumber' });
  const s = new Set<number>();
  for (const f of j.features ?? []) s.add(f.properties?.VolcanoNumber);
  return s;
}

/* ============================ Observatórios nacionais (alertas oficiais) ============================
 * USGS HANS, PHIVOLCS (WoVoDat) e PVMBG (MAGMA) são consultados pelo backend local,
 * que aplica timeout por fonte, cache e deduplicação para não sobrecarregar os observatórios.
 * Nota: o site do GVP (relatórios semanais/current eruptions) bloqueia acesso não-navegador (403);
 * o status de erupção vem do WFS (flag ContinuingEruption) + observatórios nacionais.
 */

/** Níveis de alerta dos vulcões monitorados pelo USGS (65 vulcões dos EUA). */
export async function loadHansStatus(): Promise<Map<number, AlertInfo>> {
  const j = await fetchJsonT<any>('/api/usgs', 11_000, 'USGS HANS');
  if (!j?.ok) throw new Error(j?.error || (j?.errors || []).join('; ') || 'USGS HANS indisponível');
  const m = new Map<number, AlertInfo>() as Map<number, AlertInfo> & { stale?: boolean; stamp?: string; cacheAgeMs?: number };
  for (const value of Object.values(j.levels || {}) as any[]) {
    const vn = Number(value?.vn);
    if (!vn || !value?.level) continue;
    m.set(vn, { source: 'USGS', level: value.level, colorCode: value.color, noticeTime: value.sent });
  }
  Object.assign(m, { stale: !!j.stale, stamp: j.stamp, cacheAgeMs: j.cacheAgeMs });
  return m;
}

/** Níveis de alerta + boletins individuais (PHIVOLCS: Taal, Kanlaon, Mayon, Bulusan, Pinatubo). */
export async function loadPhivolcsStatus(): Promise<Map<string, AlertInfo>> {
  const j = await fetchJsonT<any>('/api/phivolcs', 18_000, 'PHIVOLCS');
  if (!j?.ok) throw new Error(j?.error || (j?.errors || []).join('; ') || 'PHIVOLCS indisponível');
  if (!Object.keys(j.levels ?? {}).length) throw new Error((j?.errors || []).join('; ') || 'PHIVOLCS respondeu, mas nenhum nível de alerta foi reconhecido no formato recebido.');
  const m = new Map<string, AlertInfo>() as Map<string, AlertInfo> & { stale?: boolean; stamp?: string; cacheAgeMs?: number };
  for (const [name, lvl] of Object.entries(j.levels ?? {})) {
    const d = j.details?.[name] ?? {};
    const details = [d.eqs, d.so2 ? `SO₂ ${d.so2}` : null, d.plume, d.desc].filter(Boolean).join(' · ') || undefined;
    insertAliased(m, name, { source: 'PHIVOLCS', level: lvl as number, noticeTime: j.bulletins?.[name], details });
  }
  Object.assign(m, { stale: !!j.stale, stamp: j.stamp, cacheAgeMs: j.cacheAgeMs });
  return m;
}

/** Níveis de atividade do PVMBG/MAGMA (Indonésia; III=Siaga e IV=Awas incluem erupção). */
export async function loadPvmbgStatus(): Promise<Map<string, AlertInfo>> {
  const j = await fetchJsonT<any>('/api/pvmbg', 11_000, 'PVMBG');
  if (!j?.ok) throw new Error(j?.error || (j?.errors || []).join('; ') || 'PVMBG indisponível');
  if (!Object.keys(j.levels ?? {}).length) throw new Error((j?.errors || []).join('; ') || 'PVMBG respondeu, mas nenhum nível de atividade foi reconhecido no formato recebido.');
  const m = new Map<string, AlertInfo>() as Map<string, AlertInfo> & { stale?: boolean; stamp?: string; cacheAgeMs?: number };
  for (const [name, lvl] of Object.entries(j.levels ?? {})) {
    insertAliased(m, name, { source: 'PVMBG', level: lvl as number, noticeTime: j.stamp ? String(j.stamp).slice(0, 10) : undefined });
  }
  Object.assign(m, { stale: !!j.stale, stamp: j.stamp, cacheAgeMs: j.cacheAgeMs });
  return m;
}

/* ============================ Central de Inteligência (relatórios + notícias) ============================ */

/** Panorama mundial + relatórios processados (boletins oficiais e notícias, 48 h). */
export async function loadReports(): Promise<ReportsPayload> {
  const j = await fetchJsonT<ReportsPayload & { error?: string }>('/api/reports', 37_000, 'Central de relatórios');
  if (!j?.ok) throw new Error(j?.error || 'Central de relatórios indisponível');
  return j as ReportsPayload;
}

/** Deriva tags de atividade por vn a partir dos relatórios (janela 48 h). */
export function activityByVolcano(items: ReportItem[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const it of items) {
    if (!it.volcanoVn || Date.now() - it.ts > 48 * 3600_000) continue;
    const set = new Set(m.get(it.volcanoVn) ?? []);
    for (const c of it.cats) set.add(c);
    if (it.ashKm) set.add('CINZAS');
    m.set(it.volcanoVn, [...set]);
  }
  return m;
}

/** Detalhe de um vulcão (Remarks, imagem) — sob demanda. */
export async function loadVolcanoDetail(vn: number): Promise<{ remarks?: string; image?: Volcano['image'] }> {
  const j = await gvpQuery({ typeNames: VP_LAY, count: '1', cql_filter: `VolcanoNumber=${vn}` });
  const f = (j.features ?? [])[0];
  if (!f) return {};
  const p = f.properties || {};
  return {
    remarks: p.Remarks || undefined,
    image: { file: p.VPImageFileName, caption: p.VPImageCaption, credit: p.VPImageCredit },
  };
}

export interface VolcanoHistory {
  list: Array<{ start: string; end: string | null; vei: number | null; type: string }>;
  stamp: string | null; // timestamp do WFS no momento da coleta
  first: string | null; // primeira erupção conhecida (Holoceno)
  last: string | null;  // erupção mais recente
}

/** Histórico de erupções do vulcão (Holoceno completo) — sob demanda. */
export async function loadVolcanoEruptions(vn: number): Promise<VolcanoHistory> {
  const j = await gvpQuery({ typeNames: ER_HOL_LAY, count: '500', cql_filter: `Volcano_Number=${vn}` });
  const fmt = (y: any, m: any, d: any) => {
    if (!y) return null;
    return `${y}` + (m ? `-${String(m).padStart(2, '0')}` : '') + (d ? `-${String(d).padStart(2, '0')}` : '');
  };
  const list = (j.features ?? [])
    .map((f: any) => {
      const p = f.properties || {};
      return {
        start: fmt(p.StartDateYear, p.StartDateMonth, p.StartDateDay) ?? 'data incerta',
        end: fmt(p.EndDateYear, p.EndDateMonth, p.EndDateDay),
        vei: num(p.ExplosivityIndexMax),
        type: p.Activity_Type ?? '',
      };
    })
    .sort((a: any, b: any) => (parseFloat(b.start) || 0) - (parseFloat(a.start) || 0));
  const first = list.length ? list[list.length - 1].start.slice(0, 4) : null;
  const last = list.length ? list[0].start : null;
  return { list, stamp: j.timeStamp ?? null, first, last };
}

export interface HistoricalHazard {
  maxVei: number | null;
  eventCount: number;
  stamp: number;
}

const HAZARD_CACHE_KEY = 'tp.gvp.historical-hazards.v1';
const HAZARD_TTL = 24 * 60 * 60_000;
const hazardCache = new Map<number, HistoricalHazard>();
let hazardCacheLoaded = false;
let hazardFlight: Promise<Map<number, HistoricalHazard>> | null = null;

function hydrateHazardCache() {
  if (hazardCacheLoaded) return;
  hazardCacheLoaded = true;
  try {
    const stored = JSON.parse(localStorage.getItem(HAZARD_CACHE_KEY) || '{}') as Record<string, HistoricalHazard>;
    for (const [key, value] of Object.entries(stored)) {
      if (value && Number.isFinite(value.stamp) && Date.now() - value.stamp < HAZARD_TTL) {
        const maxVei = value.maxVei != null && Number.isFinite(Number(value.maxVei)) ? Number(value.maxVei) : null;
        hazardCache.set(Number(key), { maxVei, eventCount: Number.isFinite(value.eventCount) ? value.eventCount : 0, stamp: value.stamp });
      }
    }
  } catch { /* cache local opcional */ }
}

/** Consulta compacta e compartilhada do VEI máximo histórico para os vulcões em erupção. */
export async function loadHistoricalHazards(vns: number[]): Promise<Map<number, HistoricalHazard>> {
  hydrateHazardCache();
  const ids = [...new Set(vns.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return new Map();
  const missing = ids.filter((id) => !hazardCache.has(id));
  if (missing.length && !hazardFlight) {
    hazardFlight = (async () => {
      for (let offset = 0; offset < missing.length; offset += 60) {
        const batch = missing.slice(offset, offset + 60);
        const j = await gvpQuery({
          typeNames: ER_HOL_LAY,
          count: '5000',
          propertyName: 'Volcano_Number,ExplosivityIndexMax',
          cql_filter: `Volcano_Number IN (${batch.join(',')})`,
        });
        const grouped = new Map<number, { maxVei: number | null; eventCount: number }>();
        for (const feature of j.features ?? []) {
          const props = feature.properties || {};
          const id = Number(props.Volcano_Number);
          if (!batch.includes(id)) continue;
          const veiValue = num(props.ExplosivityIndexMax);
          const vei = veiValue != null && Number.isFinite(veiValue) ? veiValue : null;
          const current = grouped.get(id) ?? { maxVei: null, eventCount: 0 };
          current.eventCount += 1;
          if (vei != null && (current.maxVei == null || vei > current.maxVei)) current.maxVei = vei;
          grouped.set(id, current);
        }
        const stamp = Date.now();
        for (const id of batch) {
          const value = { ...(grouped.get(id) ?? { maxVei: null, eventCount: 0 }), stamp };
          hazardCache.set(id, value);
        }
      }
      try { localStorage.setItem(HAZARD_CACHE_KEY, JSON.stringify(Object.fromEntries(hazardCache))); } catch { /* quota/private mode */ }
      return new Map(hazardCache);
    })().finally(() => { hazardFlight = null; });
  }
  if (missing.length && hazardFlight) {
    try { await hazardFlight; } catch (error) {
      if (!ids.every((id) => hazardCache.has(id))) throw error;
    }
  }
  return new Map(ids.filter((id) => hazardCache.has(id)).map((id) => [id, hazardCache.get(id)!]));
}

/* ============================ Terremotos ============================ */

/** Feed USGS ComCat apropriado ao período/magnitude (GeoJSON público, CORS aberto). */
export function usgsFeedUrl(period: Period, minMag: number): string {
  // "all" cobre todos os eventos do período; tiers superiores apenas reduzem volume
  const tier = minMag >= 4.5 ? '4.5' : minMag >= 2.5 ? '2.5' : 'all';
  const p = period === 'day' ? 'day' : period === 'week' ? 'week' : 'month';
  return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${tier}_${p}.geojson`;
}

function parseUSGS(j: any): Quake[] {
  return (j.features ?? [])
    .filter((f: any) => f.geometry?.coordinates)
    .map((f: any) => {
      const p = f.properties;
      return {
        id: f.id,
        mag: p.mag ?? -1,
        magType: p.magType ?? '',
        place: p.place ?? '—',
        time: p.time,
        updated: p.updated,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        depthKm: f.geometry.coordinates[2] ?? 0,
        url: p.url ?? '',
        source: 'USGS',
        status: p.status ?? '',
        alert: p.alert ?? null,
        felt: p.felt ?? null,
        tsunami: p.tsunami ?? 0,
      } as Quake;
    });
}

export async function loadQuakesUSGS(period: Period, minMag: number): Promise<Quake[]> {
  const r = await fetch(usgsFeedUrl(period, minMag));
  if (!r.ok) throw new Error(`USGS HTTP ${r.status}`);
  return parseUSGS(await r.json());
}

/** EMSC SeismicPortal (fdsnws) — fallback quando o USGS está indisponível. */
export async function loadQuakesEMSC(period: Period, minMag: number): Promise<Quake[]> {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const start = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 19);
  const url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&starttime=${start}&minmagnitude=${minMag}&limit=1000&orderby=time`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`EMSC HTTP ${r.status}`);
  const j = await r.json();
  return (j.features ?? []).map((f: any): Quake => {
    const p = f.properties;
    const c = f.geometry?.coordinates ?? [0, 0, 0];
    return {
      id: `${p.auth ?? ''}-${p.eventid ?? f.id ?? Math.random().toString(36).slice(2)}`,
      mag: p.mag ?? -1,
      magType: p.magtype ?? '',
      place: p.ev_regionname ?? p.flynn_region ?? 'Região não informada',
      time: Date.parse(p.time),
      updated: Date.parse(p.last_update ?? p.time),
      lat: c[1], lon: c[0], depthKm: c[2] ?? 0,
      url: p.detail_url ?? 'https://www.seismicportal.eu/',
      source: 'EMSC',
      status: p.ev_type ?? '',
      alert: null,
      felt: null,
      tsunami: 0,
    };
  });
}

export async function loadQuakes(period: Period, minMag: number): Promise<{ quakes: Quake[]; source: 'USGS' | 'EMSC'; error?: string }> {
  try {
    return { quakes: await loadQuakesUSGS(period, minMag), source: 'USGS' };
  } catch (e) {
    try {
      const q = await loadQuakesEMSC(period, minMag);
      if (q.length) return { quakes: q, source: 'EMSC' };
      return { quakes: [], source: 'EMSC', error: String(e) };
    } catch (e2) {
      throw new Error(`USGS e EMSC indisponíveis (${e}; ${e2})`);
    }
  }
}

/* ============================ Fontes auxiliares ============================ */

/** Resumo da Wikipedia (REST, CORS aberto) — para "SAIBA MAIS". */
export async function loadWikipedia(name: string): Promise<{ title: string; extract: string; url: string } | null> {
  for (const t of [`${name}`, `${name} (volcano)`, `Mount ${name}`]) {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}?redirect=true`);
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type === 'disambiguation') continue;
      if (j.extract) return { title: j.title, extract: j.extract, url: j.content_urls?.desktop?.page ?? '' };
    } catch { /* tenta próximo */ }
  }
  return null;
}

/** Geocoding OSM Nominatim (busca de cidades/locais; uso moderado, com debounce no cliente). */
export async function nominatimSearch(q: string): Promise<Array<{ label: string; lat: number; lon: number }>> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, {
    headers: { 'Accept-Language': 'pt-BR,pt,en' },
  });
  if (!r.ok) return [];
  return (await r.json()).map((x: any) => ({ label: x.display_name, lat: parseFloat(x.lat), lon: parseFloat(x.lon) }));
}

/* ============================ Imagens (GVP + Wikimedia Commons) ============================ */

/** URL da miniatura oficial do Smithsonian GVP. */
export const GVP_IMAGE_URL = (file?: string | null) =>
  file ? `https://www.volcano.si.edu/build/images/thumbs/${file}.jpg` : undefined;

const commonsCache = new Map<string, Promise<{ url: string; credit?: string; license?: string } | null>>();

/** Busca uma fotografia no Wikimedia Commons pelo nome do vulcão (API pública, CORS aberto). */
export function commonsImage(name: string): Promise<{ url: string; credit?: string; license?: string } | null> {
  const key = name.toLowerCase();
  if (commonsCache.has(key)) return commonsCache.get(key)!;
  const p = (async () => {
    try {
      const params = new URLSearchParams({
        action: 'query', format: 'json', origin: '*',
        generator: 'search', gsrsearch: `File:${name}`, gsrnamespace: '6', gsrlimit: '3',
        prop: 'imageinfo', iiprop: 'url|extmetadata',
      });
      const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
      if (!r.ok) return null;
      const j = await r.json();
      const pages = Object.values(j?.query?.pages ?? {}) as any[];
      for (const pg of pages.sort((a, b) => a.index - b.index)) {
        const ii = pg?.imageinfo?.[0];
        if (!ii?.url) continue;
        const artist = ii.extmetadata?.Artist?.value ? String(ii.extmetadata.Artist.value).replace(/<[^>]+>/g, '').trim() : undefined;
        const license = ii.extmetadata?.LicenseShortName?.value;
        return { url: ii.url, credit: artist, license };
      }
      return null;
    } catch {
      return null;
    }
  })();
  commonsCache.set(key, p);
  return p;
}

/* ============================ Geocoding de países (fitBounds) ============================ */

const boundsCache = new Map<string, [number, number][][]>();

/** Retorna polígono simplificado (lista de anéis de [lat,lon]) do país via Nominatim; cache em memória. */
export async function countryPolygon(name: string): Promise<[number, number][][] | null> {
  const key = name.toLowerCase();
  if (boundsCache.has(key)) return boundsCache.get(key)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&q=${encodeURIComponent(name)}`,
      { headers: { 'Accept-Language': 'en' } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const gj = j?.[0]?.geojson;
    if (!gj) return null;
    const rings: [number, number][][] =
      gj.type === 'Polygon' ? [gj.coordinates[0].map((c: number[]) => [c[1], c[0]])]
      : gj.type === 'MultiPolygon' ? gj.coordinates.map((poly: number[][][]) => poly[0].map((c: number[]) => [c[1], c[0]]))
      : [];
    if (!rings.length) return null;
    boundsCache.set(key, rings);
    return rings;
  } catch {
    return null;
  }
}


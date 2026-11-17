// Central sísmica multi-origem GeoGus.
// Catálogos de eventos: USGS, USP/FDSN, LabSis-UFRN, SISBRA preliminar,
// EMSC, GFZ/GEOFON e ISC. Fontes são consultadas de forma independente,
// com cache por instituição, timeouts e deduplicação espaço-temporal.
// RSBR/ON/UnB também operam redes e disponibilizam estações/forma de onda;
// esses serviços não são convertidos artificialmente em eventos sem um catálogo.

const AGGREGATE_TTL = 30_000;
const STALE_TTL = 30 * 60_000;
const DEFAULT_TIMEOUT = 5_000;
const BRAZIL_BOUNDS = { minLat: -35.5, maxLat: 7.5, minLon: -75.5, maxLon: -32.0 };
const state = globalThis.__geogusEarthquakes ??= {
  cache: new Map(), inflight: new Map(), sourceCache: new Map(), sourceInflight: new Map(), sourceMeta: new Map(),
};
state.sourceMeta ??= new Map();

const URLS = {
  usp: 'https://www.moho.iag.usp.br/fdsnws/event/1/query',
  uspLatest: 'https://moho.iag.usp.br/eq/latest',
  labsis: 'https://labsis.ufrn.br/boletins',
  unbBulletin: 'https://obsis.unb.br/portalsis/?pg=bulletin',
  unimontesPage: 'https://unimontes.br/projetos-e-servicos/nucleo-de-estudos-sismologicos-nes/',
  unimontesFeed: 'https://unimontes.br/?s=sismologia&feed=rss2',
  sisbraPrelim: 'https://sismo.iag.usp.br/boletim/boletim2001p.txt',
  emsc: 'https://www.seismicportal.eu/fdsnws/event/1/query',
  geofon: 'https://geofon.gfz.de/fdsnws/event/1/query',
  isc: 'https://isc.ac.uk/fdsnws/event/1/query',
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary',
};

function periodValue(value) {
  return ['day', 'week', 'month'].includes(String(value)) ? String(value) : 'day';
}
function magnitudeValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 1;
}
function periodDays(period) { return period === 'day' ? 1 : period === 'week' ? 7 : 30; }
function withinPeriod(time, period) { return Number.isFinite(time) && time >= Date.now() - periodDays(period) * 86_400_000; }

async function fetchResponse(url, timeoutMs = DEFAULT_TIMEOUT, accept = 'application/json, application/xml;q=0.9, text/plain;q=0.8') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': 'GeoGus/1.0 (public seismological data aggregation)',
      },
    });
    if (response.status === 204) return { status: 204, text: '' };
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} em ${new URL(url).hostname}`), { status: response.status });
    return { status: response.status, text };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`Timeout de ${Math.round(timeoutMs / 100) / 10}s em ${new URL(url).hostname}`);
    }
    throw error;
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT) {
  const { text } = await fetchResponse(url, timeoutMs, 'application/geo+json, application/json, text/json;q=0.9');
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Resposta não JSON de ${new URL(url).hostname}`); }
}

function normaliseQuake({ id, mag, magType = '', place, time, updated, lat, lon, depthKm = 0, url = '', source, sources, status = '', alert = null, felt = null, tsunami = 0 }) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || !Number.isFinite(Number(time)) || !Number.isFinite(Number(mag))) return null;
  return {
    id: String(id || `${source || 'event'}-${time}-${Number(lat).toFixed(3)}-${Number(lon).toFixed(3)}`),
    mag: Number(mag), magType: String(magType || ''), place: String(place || 'Localização não informada'),
    time: Number(time), updated: Number(updated) || Number(time), lat: Number(lat), lon: Number(lon),
    depthKm: Number.isFinite(Number(depthKm)) ? Number(depthKm) : 0,
    url: String(url || ''), source: String(source || 'Catálogo'),
    sources: [...new Set((sources || [source || 'Catálogo']).map(String))],
    status: String(status || ''), alert: alert ?? null, felt: felt == null ? null : Number(felt), tsunami: Number(tsunami) || 0,
  };
}

function fromUSGS(payload, minMag) {
  return (payload?.features || []).flatMap((feature) => {
    const c = feature?.geometry?.coordinates || [];
    const p = feature?.properties || {};
    const q = normaliseQuake({
      id: feature.id, mag: p.mag, magType: p.magType, place: p.place, time: Number(p.time), updated: Number(p.updated),
      lon: c[0], lat: c[1], depthKm: c[2], url: p.url, source: 'USGS', status: p.status, alert: p.alert,
      felt: p.felt, tsunami: p.tsunami,
    });
    return q && q.mag >= minMag ? [q] : [];
  }).sort((a, b) => b.time - a.time);
}

function fromEMSC(payload, minMag) {
  return (payload?.features || []).flatMap((feature) => {
    const p = feature?.properties || {};
    const c = feature?.geometry?.coordinates || [];
    const time = Date.parse(p.time ?? p.Time ?? p.originTime ?? '');
    const lat = c[1] ?? p.lat ?? p.Lat;
    const lon = c[0] ?? p.lon ?? p.Lon;
    const mag = p.mag ?? p.Mag;
    const id = p.eventid ?? p.source_id ?? p.Source_id ?? feature.id;
    const q = normaliseQuake({
      id: `EMSC-${p.auth ?? p.Auth ?? 'EMSC'}-${id || `${time}-${lat}-${lon}`}`,
      mag, magType: p.magtype ?? p.Magtype, place: p.ev_regionname ?? p.flynn_region ?? p.Flynn_region ?? 'Região não informada',
      time, updated: Date.parse(p.last_update ?? p.Lastupdate ?? p.time ?? p.Time) || time,
      lat, lon, depthKm: c[2] ?? p.depth ?? p.Depth, url: p.detail_url ?? p.url ?? 'https://www.seismicportal.eu/',
      source: 'EMSC', status: p.ev_type ?? p.Evtype,
    });
    return q && q.mag >= minMag ? [q] : [];
  }).sort((a, b) => b.time - a.time);
}

// QuakeML reader comum para USP, GEOFON e ISC.
function xmlBlocks(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`, 'gi');
  return [...String(xml || '').matchAll(re)].map((m) => ({ attrs: m[1] || '', inner: m[2] || '' }));
}
function decodeXmlMarkup(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function decodeXml(value) { return decodeXmlMarkup(value).replace(/<[^>]*>/g, '').trim(); }
function xmlText(xml, tag) { const b = xmlBlocks(xml, tag)[0]; return b ? decodeXml(b.inner) : ''; }
function xmlValue(xml, tag) {
  const b = xmlBlocks(xml, tag)[0];
  if (!b) return '';
  return xmlText(b.inner, 'value') || decodeXml(b.inner);
}
function xmlAttribute(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i');
  return re.exec(attrs)?.[1] || '';
}
function parseFdsnQuakeML(xml, { minMag = 0, source = 'FDSN', label = source, url = '', brazilOnly = false } = {}) {
  const text = String(xml || '');
  if (!text.trim()) return [];
  if (!/<(?:[\w.-]+:)?event\b/i.test(text)) {
    if (/Exception|error|invalid parameter|serviceexception/i.test(text)) throw new Error(`${label}: resposta XML de erro: ${text.slice(0, 160)}`);
    return [];
  }
  const result = [];
  for (const event of xmlBlocks(text, 'event')) {
    const preferredOriginId = xmlText(event.inner, 'preferredOriginID');
    const origins = xmlBlocks(event.inner, 'origin');
    const origin = origins.find((item) => xmlAttribute(item.attrs, 'publicID') === preferredOriginId) || origins[0];
    if (!origin) continue;
    const preferredMagnitudeId = xmlText(event.inner, 'preferredMagnitudeID');
    const magnitudes = xmlBlocks(event.inner, 'magnitude');
    const magnitude = magnitudes.find((item) => xmlAttribute(item.attrs, 'publicID') === preferredMagnitudeId) || magnitudes[0];
    const magBlock = magnitude ? xmlBlocks(magnitude.inner, 'mag')[0] : null;
    const mag = Number(magBlock ? xmlValue(magBlock.inner, 'value') : '');
    const time = Date.parse(xmlValue(origin.inner, 'time'));
    const lat = Number(xmlValue(origin.inner, 'latitude'));
    const lon = Number(xmlValue(origin.inner, 'longitude'));
    const depthMeters = Number(xmlValue(origin.inner, 'depth'));
    if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag) || mag < minMag) continue;
    if (brazilOnly && (lat < BRAZIL_BOUNDS.minLat || lat > BRAZIL_BOUNDS.maxLat || lon < BRAZIL_BOUNDS.minLon || lon > BRAZIL_BOUNDS.maxLon)) continue;
    const description = xmlBlocks(event.inner, 'description').map((d) => xmlText(d.inner, 'text')).find(Boolean) || '';
    const mode = xmlText(origin.inner, 'evaluationMode').toLowerCase();
    const evaluation = xmlText(origin.inner, 'evaluationStatus').toLowerCase();
    const status = mode === 'manual' || evaluation === 'confirmed' ? `Revisado · ${label}` : `Automático · ${label}`;
    const magnitudeType = magnitude ? xmlText(magnitude.inner, 'type') : '';
    const eventId = xmlAttribute(event.attrs, 'publicID') || `${time}-${lat.toFixed(3)}-${lon.toFixed(3)}`;
    const q = normaliseQuake({
      id: `${source}-${eventId}`, mag, magType: magnitudeType || 'M',
      place: description || (brazilOnly ? `Brasil · ${label}` : `Evento global · ${label}`),
      time, updated: time, lat, lon, depthKm: Number.isFinite(depthMeters) ? Math.max(0, depthMeters / 1000) : 0,
      url, source, sources: [label], status,
    });
    if (q) result.push(q);
  }
  return result.sort((a, b) => b.time - a.time);
}

// Boletim público do LabSis/UFRN. A própria página declara cobertura Nordeste,
// magnitude >= 1.5, horário UTC e marca com * magnitudes preliminares.
function htmlToText(html) {
  return String(html || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:tr|p|h[1-6]|li|div)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[\t\f\v ]+/g, ' ').replace(/\r/g, '\n');
}
function parseLabSisBulletin(html, minMag = 0, period = 'month') {
  const text = htmlToText(html);
  const re = /(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(-?\d+(?:[.,]\d+)?)(\*)?\s+(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)\s+([A-Z]{2})\s+([^\n\r]+)/g;
  const result = [];
  for (const m of text.matchAll(re)) {
    const [, y, mo, d, clock, magRaw, star, latRaw, lonRaw, uf, localityRaw] = m;
    const time = Date.parse(`${y}-${mo}-${d}T${clock}Z`);
    const mag = Number(magRaw.replace(',', '.'));
    if (!withinPeriod(time, period) || !Number.isFinite(mag) || mag < minMag) continue;
    const lat = Number(latRaw); const lon = Number(lonRaw);
    if (lat < -35.5 || lat > 7.5 || lon < -75.5 || lon > -32) continue;
    const place = `${localityRaw.trim()}, ${uf}, Brasil`;
    const q = normaliseQuake({
      id: `LABSIS-${time}-${lat.toFixed(3)}-${lon.toFixed(3)}`, mag, magType: 'ML', place,
      time, updated: time, lat, lon, depthKm: 0, url: URLS.labsis, source: 'LabSis',
      sources: ['LabSis/UFRN', 'RSISNE'],
      status: star ? 'Magnitude preliminar · LabSis/UFRN' : 'Boletim LabSis/UFRN',
    });
    if (q) result.push(q);
  }
  return result.sort((a, b) => b.time - a.time);
}


// Parser conservador para boletins HTML tabulados. Só cria evento quando a
// própria tabela identifica data, hora, magnitude, latitude e longitude.
// Isso evita geocodificar nomes de municípios como se fossem epicentros.
function normaliseHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function firstNumeric(value) {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}
function parseBulletinDate(value) {
  const text = String(value || '').trim();
  let m = /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/.exec(text);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/.exec(text);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function parseBulletinTime(value) {
  const m = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/.exec(String(value || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : '';
}
function parseTableBasedBrazilianEvents(html, { source, label, minMag = 0, period = 'month', url = '', utcOffsetHours = 0 } = {}) {
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) => htmlToText(cell[1]).trim()),
  ).filter((cells) => cells.length >= 4);
  if (!rows.length) return [];
  let headerIndex = -1;
  let indexes = null;
  const findHeader = (headers, patterns) => headers.findIndex((h) => patterns.some((p) => p.test(normaliseHeader(h))));
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const h = rows[i].map(normaliseHeader);
    const date = findHeader(h, [/^data$/, /^date$/, /data.*hora/, /date.*time/]);
    const time = findHeader(h, [/^hora$/, /^time$/, /hora utc/, /hora local/]);
    const mag = findHeader(h, [/^mag$/, /magnitude/, /^ml$/, /^mb$/, /^mr$/]);
    const lat = findHeader(h, [/^lat$/, /latitude/]);
    const lon = findHeader(h, [/^lon$/, /longitude/]);
    if (date >= 0 && mag >= 0 && lat >= 0 && lon >= 0 && (time >= 0 || /data.*hora|date.*time/.test(h[date]))) {
      headerIndex = i; indexes = { date, time, mag, lat, lon,
        depth: findHeader(h, [/depth/, /profundidade/]),
        place: findHeader(h, [/local/, /municipio/, /municipality/, /epicentro/, /region/]),
        state: findHeader(h, [/^uf$/, /^estado$/]),
      };
      break;
    }
  }
  if (headerIndex < 0 || !indexes) return [];
  const result = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const dateCell = cells[indexes.date] || '';
    const combinedDate = parseBulletinDate(dateCell);
    const timeCell = indexes.time >= 0 ? (cells[indexes.time] || '') : dateCell;
    const date = combinedDate || parseBulletinDate(timeCell);
    const clock = parseBulletinTime(timeCell) || parseBulletinTime(dateCell);
    if (!date || !clock) continue;
    const time = Date.parse(`${date}T${clock}Z`) + (Number(utcOffsetHours) || 0) * 3_600_000;
    const mag = firstNumeric(cells[indexes.mag]);
    const lat = firstNumeric(cells[indexes.lat]);
    const lon = firstNumeric(cells[indexes.lon]);
    if (!withinPeriod(time, period) || !Number.isFinite(mag) || mag < minMag) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < BRAZIL_BOUNDS.minLat || lat > BRAZIL_BOUNDS.maxLat || lon < BRAZIL_BOUNDS.minLon || lon > BRAZIL_BOUNDS.maxLon) continue;
    const depth = indexes.depth >= 0 ? firstNumeric(cells[indexes.depth]) : 0;
    const municipality = indexes.place >= 0 ? cells[indexes.place] : '';
    const uf = indexes.state >= 0 ? cells[indexes.state] : '';
    const place = [municipality, uf, 'Brasil'].filter(Boolean).join(', ');
    const q = normaliseQuake({
      id: `${source}-${time}-${lat.toFixed(3)}-${lon.toFixed(3)}`, mag, magType: 'M', place: place || `Brasil · ${label}`,
      time, updated: time, lat, lon, depthKm: Number.isFinite(depth) ? depth : 0,
      url, source, sources: [label], status: `Boletim tabulado · ${label}`,
    });
    if (q) result.push(q);
  }
  return result.sort((a, b) => b.time - a.time);
}
async function loadUnB(period, minMag) {
  const { text } = await fetchResponse(URLS.unbBulletin, 3_800, 'text/html,application/xhtml+xml;q=0.9');
  return parseTableBasedBrazilianEvents(text, { source: 'UnB', label: 'SIS-UnB · Boletim Sísmico', minMag, period, url: URLS.unbBulletin });
}
function parseUnimontesRss(xml, minMag = 0, period = 'month') {
  const items = xmlBlocks(xml, 'item');
  const result = [];
  for (const item of items) {
    const title = xmlText(item.inner, 'title');
    const link = xmlText(item.inner, 'link') || URLS.unimontesFeed;
    const encoded = xmlBlocks(item.inner, 'encoded')[0]?.inner;
    const description = xmlBlocks(item.inner, 'description')[0]?.inner;
    const content = decodeXmlMarkup(encoded || description || '');
    // RSS só gera epicentro se o artigo trouxer tabela com coordenadas explícitas.
    const parsed = parseTableBasedBrazilianEvents(content, {
      source: 'Unimontes', label: `NES/Unimontes · ${title}`, minMag, period, url: link, utcOffsetHours: 3,
    });
    result.push(...parsed);
  }
  return result.sort((a, b) => b.time - a.time);
}
function discoverUnimontesPdfLinks(html) {
  const found = [];
  const anchors = [...String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const anchor of anchors) {
    const href = /href\s*=\s*[\"']([^\"']+)[\"']/i.exec(anchor[1])?.[1];
    if (!href || !/\.pdf(?:[?#]|$)/i.test(href)) continue;
    const title = htmlToText(anchor[2]).trim() || href.split('/').pop();
    if (!/boletim|sism|tremor|abalo|nes/i.test(`${title} ${href}`)) continue;
    try {
      const url = new URL(href, URLS.unimontesPage).toString();
      if (!found.some((item) => item.url === url)) found.push({ title, url, format: 'PDF', realtime: false });
    } catch { /* ignora hrefs inválidos */ }
  }
  return found.slice(0, 60);
}
async function loadUnimontes(period, minMag) {
  // A Unimontes divulga boletins mensais em PDF, não um catálogo de eventos FDSN.
  // Descobrimos automaticamente os boletins; só convertemos tabelas HTML/RSS
  // quando o próprio documento expõe data, hora, magnitude e epicentro explícitos.
  const requests = await Promise.allSettled([
    fetchResponse(URLS.unimontesPage, 3_800, 'text/html,application/xhtml+xml;q=0.9'),
    fetchResponse(URLS.unimontesFeed, 3_800, 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8'),
  ]);
  const page = requests[0].status === 'fulfilled' ? requests[0].value.text : '';
  const rss = requests[1].status === 'fulfilled' ? requests[1].value.text : '';
  if (!page && !rss) throw new Error(`NES/Unimontes indisponível: ${requests.map((r) => r.status === 'rejected' ? String(r.reason?.message || r.reason) : '').filter(Boolean).join(' | ')}`);
  const documents = discoverUnimontesPdfLinks(page);
  state.sourceMeta.set('unimontes-nes', {
    documents,
    note: 'Boletins mensais em PDF descobertos automaticamente. Não geram epicentros sem extração estruturada validada.',
    pageAvailable: Boolean(page), rssAvailable: Boolean(rss),
  });
  const pageEvents = page ? parseTableBasedBrazilianEvents(page, {
    source: 'Unimontes', label: 'NES/Unimontes · tabela HTML', minMag, period, url: URLS.unimontesPage, utcOffsetHours: 3,
  }) : [];
  const rssEvents = rss ? parseUnimontesRss(rss, minMag, period) : [];
  return mergeEvents([pageEvents, rssEvents]);
}

// Boletim preliminar SISBRA publicado regularmente pela USP. Consolida dados
// e contribuições (ex.: IAG/USP, UFRN, UnB e outros); não é boletim revisado.
function parseSISBRAPrelim(text, minMag = 0, period = 'month') {
  const result = [];
  const brStates = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
  for (const line of String(text || '').split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 12 || !/^\d{4}$/.test(tokens[0]) || !/^\d{4}$/.test(tokens[1]) || !/^\d{6}$/.test(tokens[2])) continue;
    const [year, mmdd, hhmmss] = tokens;
    const lat = Number(tokens[3]); const lon = Number(tokens[4]);
    const uf = tokens[6];
    const depthRaw = Number(tokens[7]);
    const mag = Number(tokens[8]);
    const catalogType = tokens[10];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag) || mag < minMag) continue;
    if (catalogType === 'D' || catalogType === 'R' || /meteorito|explos[aã]o|pedreira/i.test(line)) continue;
    const time = Date.parse(`${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}Z`);
    if (!withinPeriod(time, period)) continue;
    // Io (intensidade) é opcional em algumas linhas; remove apenas valores reconhecíveis.
    let tail = tokens.slice(11);
    // Campos Io e Af são numéricos e aparecem antes da localidade no RAW.
    if (tail.length && /^-?$|^\d+(?:-\d+)?$/.test(tail[0])) tail = tail.slice(1);
    if (tail.length && /^-?$|^\d+(?:[.]\d+)?$/.test(tail[0])) tail = tail.slice(1);
    const locality = tail.join(' ').trim() || 'Localidade não informada';
    const place = brStates.has(uf) ? `${locality}, ${uf}, Brasil` : locality;
    const contributors = [...line.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]).join(',');
    const contributionSources = [];
    if (/\bUnB\b/i.test(contributors)) contributionSources.push('SIS-UnB');
    if (/\bUFRN\b/i.test(contributors)) contributionSources.push('UFRN / RSISNE');
    if (/\bIAG\b|\bUSP\b/i.test(contributors)) contributionSources.push('USP / BRASIS');
    if (/\bON\b|\bRSIS\b/i.test(contributors)) contributionSources.push('Observatório Nacional / RSIS');
    const q = normaliseQuake({
      id: `SISBRA-${time}-${lat.toFixed(3)}-${lon.toFixed(3)}`, mag, magType: 'M (SISBRA preliminar)', place,
      time, updated: time, lat, lon, depthKm: Number.isFinite(depthRaw) ? Math.max(0, depthRaw) : 0,
      url: URLS.sisbraPrelim, source: 'SISBRA', sources: ['USP / SISBRA preliminar', ...contributionSources],
      status: 'Preliminar · aguarda revisão/consolidação',
    });
    if (q) result.push(q);
  }
  return result.sort((a, b) => b.time - a.time);
}

function periodStart(period) { return new Date(Date.now() - periodDays(period) * 86_400_000).toISOString(); }
function buildBrazilFdsnUrl(base, period, minMag, params = {}) {
  const query = new URLSearchParams({
    starttime: periodStart(period), endtime: new Date().toISOString(),
    minlatitude: String(BRAZIL_BOUNDS.minLat), maxlatitude: String(BRAZIL_BOUNDS.maxLat),
    minlongitude: String(BRAZIL_BOUNDS.minLon), maxlongitude: String(BRAZIL_BOUNDS.maxLon),
    minmagnitude: String(minMag), limit: String(params.limit || 500), orderby: 'time',
    includeallorigins: 'false', includeallmagnitudes: 'false', includearrivals: 'false', nodata: '204',
  });
  return `${base}?${query.toString()}`;
}

async function loadUSGS(period, minMag) {
  const p = period === 'day' ? 'day' : period === 'week' ? 'week' : 'month';
  const tier = minMag >= 4.5 ? '4.5' : minMag >= 2.5 ? '2.5' : 'all';
  return fromUSGS(await fetchJson(`${URLS.usgs}/${tier}_${p}.geojson`, 4_800), minMag);
}
async function loadUSGSFdsn(period, minMag) {
  const url = buildBrazilFdsnUrl('https://earthquake.usgs.gov/fdsnws/event/1/query', period, minMag, { limit: 400 });
  const { text } = await fetchResponse(url, 5_000, 'application/xml, text/xml;q=0.9');
  return parseFdsnQuakeML(text, { minMag, source: 'USGS-FDSN', label: 'USGS FDSN Event · consulta regional', url, brazilOnly: true });
}

async function loadUSP(period, minMag) {
  const url = buildBrazilFdsnUrl(URLS.usp, period, minMag, { limit: 500 });
  const { text } = await fetchResponse(url, 5_200, 'application/xml, text/xml;q=0.9');
  return parseFdsnQuakeML(text, { minMag, source: 'USP', label: 'Centro de Sismologia USP / BRASIS', url: URLS.uspLatest, brazilOnly: true });
}
async function loadLabSis(period, minMag) {
  const { text } = await fetchResponse(URLS.labsis, 4_800, 'text/html,application/xhtml+xml;q=0.9');
  return parseLabSisBulletin(text, minMag, period);
}
async function loadSISBRA(period, minMag) {
  const { text } = await fetchResponse(URLS.sisbraPrelim, 5_200, 'text/plain');
  return parseSISBRAPrelim(text, minMag, period);
}
async function loadEMSC(period, minMag) {
  const url = buildBrazilFdsnUrl(URLS.emsc, period, minMag, { limit: 800 });
  const emscUrl = new URL(url); emscUrl.searchParams.set('format', 'json');
  return fromEMSC(await fetchJson(emscUrl.toString(), 5_000), minMag);
}
async function loadGEOFON(period, minMag) {
  const url = buildBrazilFdsnUrl(URLS.geofon, period, minMag, { limit: 400 });
  const { text } = await fetchResponse(url, 5_000, 'application/xml, text/xml;q=0.9');
  return parseFdsnQuakeML(text, { minMag, source: 'GEOFON', label: 'GFZ / GEOFON', url: URLS.geofon, brazilOnly: true });
}
async function loadISC(period, minMag) {
  const url = buildBrazilFdsnUrl(URLS.isc, period, minMag, { limit: 400 });
  const { text } = await fetchResponse(url, 5_200, 'application/xml, text/xml;q=0.9');
  return parseFdsnQuakeML(text, { minMag, source: 'ISC', label: 'International Seismological Centre', url: URLS.isc, brazilOnly: true });
}

function haversineKm(a, b) {
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function sourceQuality(q) {
  const s = q.status || '';
  if (/revisado|manual|confirmed/i.test(s)) return 5;
  if (q.source === 'USP') return 4;
  if (q.source === 'LabSis' || q.source === 'UnB') return /preliminar|automatico|automático/i.test(s) ? 2 : 3;
  if (q.source === 'Unimontes') return /preliminar/i.test(s) ? 2 : 3;
  if (q.source === 'SISBRA') return 1;
  if (q.source === 'USGS' || q.source === 'USGS-FDSN' || q.source === 'EMSC') return 3;
  if (q.source === 'GEOFON' || q.source === 'ISC') return 3;
  return 0;
}
function mergeEvents(eventGroups) {
  const all = eventGroups.flat().filter(Boolean).sort((a, b) => b.time - a.time);
  const merged = [];
  for (const candidate of all) {
    const matchIndex = merged.findIndex((existing) =>
      Math.abs(existing.time - candidate.time) <= 120_000 && haversineKm(existing, candidate) <= 40,
    );
    if (matchIndex < 0) { merged.push(candidate); continue; }
    const current = merged[matchIndex];
    const combinedSources = [...new Set([...(current.sources || [current.source]), ...(candidate.sources || [candidate.source])])];
    const keepCandidate = sourceQuality(candidate) > sourceQuality(current);
    const preferred = keepCandidate ? candidate : current;
    merged[matchIndex] = {
      ...preferred,
      // Retém o ID principal mais forte, sem perder os demais identificadores de catálogo.
      id: preferred.id,
      sources: combinedSources,
      magType: preferred.magType || current.magType || candidate.magType,
      url: preferred.url || current.url || candidate.url,
      status: preferred.status || current.status || candidate.status,
    };
  }
  return merged.sort((a, b) => b.time - a.time);
}

async function cachedSource(id, label, loader, ttlMs, staleTtlMs = STALE_TTL) {
  const now = Date.now();
  const cached = state.sourceCache.get(id);
  if (cached && now - cached.savedAt < ttlMs) {
    return { id, label, ok: true, stale: false, cached: true, count: cached.data.length, data: cached.data, stamp: cached.savedAt, ...(state.sourceMeta.get(id) || {}) };
  }
  if (state.sourceInflight.has(id)) return state.sourceInflight.get(id);
  const task = (async () => {
    try {
      const data = await loader();
      state.sourceCache.set(id, { savedAt: Date.now(), data });
      return { id, label, ok: true, stale: false, cached: false, count: data.length, data, stamp: Date.now(), ...(state.sourceMeta.get(id) || {}) };
    } catch (error) {
      const message = String(error?.message || error);
      if (cached && now - cached.savedAt < staleTtlMs) {
        return { id, label, ok: true, stale: true, cached: true, count: cached.data.length, data: cached.data, stamp: cached.savedAt, error: message, ...(state.sourceMeta.get(id) || {}) };
      }
      return { id, label, ok: false, stale: false, cached: false, count: 0, data: [], stamp: null, error: message };
    }
  })().finally(() => state.sourceInflight.delete(id));
  state.sourceInflight.set(id, task);
  return task;
}

const SOURCE_DEFINITIONS = [
  { id: 'usgs', label: 'USGS ComCat · feed global', endpoint: URLS.usgs, kind: 'catalogo-de-eventos', coverage: 'global', cadence: '60 s', ttl: 60_000, run: loadUSGS },
  { id: 'usgs-fdsn-br', label: 'USGS FDSN Event · consulta Brasil', endpoint: 'https://earthquake.usgs.gov/fdsnws/event/1/query', kind: 'catalogo-de-eventos', coverage: 'Brasil · segunda via de consulta do ComCat (não é catálogo independente)', cadence: '2 min', ttl: 2 * 60_000, run: loadUSGSFdsn },
  { id: 'usp-brasis', label: 'USP / BRASIS · FDSN Event', endpoint: URLS.usp, kind: 'catalogo-de-eventos', coverage: 'Brasil e região', cadence: '90 s', ttl: 90_000, run: loadUSP },
  { id: 'labsis-ufrn', label: 'LabSis / UFRN · boletim Nordeste', endpoint: URLS.labsis, kind: 'boletim-estruturado', coverage: 'Nordeste · magnitude publicada >= 1.5', cadence: '5 min', ttl: 5 * 60_000, run: loadLabSis },
  { id: 'sis-unb', label: 'SIS-UnB · boletim tabulado (quando disponível)', endpoint: URLS.unbBulletin, kind: 'boletim-estruturado', coverage: 'Brasil', cadence: '10 min', ttl: 10 * 60_000, run: loadUnB },
  { id: 'unimontes-nes', label: 'NES / Unimontes · descoberta de boletins PDF/RSS', endpoint: URLS.unimontesPage, kind: 'descoberta-de-boletins', coverage: 'Minas Gerais · boletins mensais', cadence: '30 min', ttl: 30 * 60_000, run: loadUnimontes },
  { id: 'sisbra-prelim', label: 'USP / SISBRA preliminar · contribuições nacionais', endpoint: URLS.sisbraPrelim, kind: 'boletim-nacional-preliminar', coverage: 'Brasil e eventos sentidos no Brasil', cadence: '15 min', ttl: 15 * 60_000, run: loadSISBRA },
  { id: 'emsc', label: 'EMSC SeismicPortal · FDSN Event', endpoint: URLS.emsc, kind: 'catalogo-de-eventos', coverage: 'global', cadence: '2 min', ttl: 2 * 60_000, run: loadEMSC },
  { id: 'geofon', label: 'GFZ / GEOFON · FDSN Event', endpoint: URLS.geofon, kind: 'catalogo-de-eventos', coverage: 'global', cadence: '5 min', ttl: 5 * 60_000, run: loadGEOFON },
  { id: 'isc', label: 'ISC · FDSN Event / Bulletin', endpoint: URLS.isc, kind: 'catalogo-de-eventos', coverage: 'global · catálogo com revisão posterior', cadence: '60 min', ttl: 60 * 60_000, run: loadISC },
];

function isBrazilianEvent(q) {
  return q.lat >= BRAZIL_BOUNDS.minLat && q.lat <= BRAZIL_BOUNDS.maxLat
    && q.lon >= BRAZIL_BOUNDS.minLon && q.lon <= BRAZIL_BOUNDS.maxLon;
}

function coverageMetadata() {
  return {
    eventCatalogs: [
      'USGS ComCat GeoJSON', 'USGS FDSN Event (segunda via de consulta do mesmo ComCat)',
      'USP / BRASIS FDSN Event', 'LabSis / UFRN bulletin',
      'SIS-UnB bulletin (best-effort HTML table; may be unavailable or not expose machine-readable rows)',
      'SISBRA preliminary (catalogue with contributions from USP, UnB, UFRN, ON and other institutions)',
      'EMSC SeismicPortal FDSN Event', 'GFZ / GEOFON FDSN Event', 'ISC FDSN Event',
    ],
    bulletinDiscovery: {
      id: 'unimontes-nes', label: 'NES / Unimontes · descoberta automática de boletins PDF',
      url: URLS.unimontesPage,
      available: Boolean(state.sourceMeta.get('unimontes-nes')?.documents?.length),
      documents: state.sourceMeta.get('unimontes-nes')?.documents || [],
      note: 'A página e os links PDF são descobertos automaticamente. Os PDFs não são convertidos em epicentros nesta integração; não inventar coordenadas nem confundir sismos naturais com detonações artificiais.',
    },
    historicalArchives: [
      { id: 'sisbra-v2024May09', label: 'SISBRA consolidado v2024May09', url: 'https://seiscode.iag.usp.br/CSUSP/sisbra/releases/tag/v2024May09', through: '2023-12-31', realtime: false },
      { id: 'unimontes-nes-pdf', label: 'NES / Unimontes · boletins mensais em PDF', url: URLS.unimontesPage, documents: state.sourceMeta.get('unimontes-nes')?.documents || [], realtime: false, note: 'Boletins mensais com sismos naturais e artificiais; descoberta dos arquivos automática, extração PDF não habilitada.' },
      { id: 'risbra-bdsdr', label: 'RISBRA / BDSDR · sismicidade induzida por reservatórios', url: 'https://nhess.copernicus.org/articles/20/2001/2020/', realtime: false, note: 'Base de investigação histórica; nenhum endpoint público de catálogo de eventos foi identificado.' },
    ],
    infrastructure: [
      { id: 'RSBR', label: 'Rede Sismográfica Brasileira', role: 'estações e formas de onda', endpoint: 'https://rsbr.iag.usp.br/fdsnws/station/1/', eventCatalog: false },
      { id: 'ON-RSIS', label: 'Observatório Nacional / RSIS', role: 'rede de estações e formas de onda', endpoint: 'https://www.rsis.on.br/', eventCatalog: false },
      { id: 'UnB-contributors', label: 'SIS-UnB / UnB', role: 'boletim independente em tentativa best-effort; também contribui com o SISBRA preliminar', endpoint: URLS.unbBulletin, eventCatalog: 'best-effort' },
    ],
    note: 'Não são contadas como catálogos independentes as redes que disponibilizam apenas estações e formas de onda. Eventos coincidentes são deduplicados e mantêm a proveniência de cada fonte. O EarthScope/IRIS FDSN Event foi aposentado em 01/06/2026 e não é consultado.',
  };
}

export async function getEarthquakeFeed(periodInput = 'day', minMagInput = 1) {
  const period = periodValue(periodInput);
  const minMag = magnitudeValue(minMagInput);
  const key = `${period}:${minMag.toFixed(1)}`;
  const now = Date.now();
  const cached = state.cache.get(key);
  if (cached && now - cached.savedAt < AGGREGATE_TTL) {
    return { ...cached.payload, cached: true, cacheAgeMs: now - cached.savedAt };
  }
  if (state.inflight.has(key)) return state.inflight.get(key);

  const task = (async () => {
    const sourceResults = await Promise.all(SOURCE_DEFINITIONS.map((source) =>
      cachedSource(source.id, source.label, () => source.run(period, minMag), source.ttl),
    ));
    const usable = sourceResults.filter((source) => source.ok);
    const eventGroups = sourceResults.map((source) => source.data);
    const quakes = mergeEvents(eventGroups);
    const errors = sourceResults.filter((source) => source.error).map((source) => `${source.label}: ${source.error}`);
    if (!usable.length) {
      if (cached && now - cached.savedAt < STALE_TTL) {
        return { ...cached.payload, ok: true, stale: true, cached: true, cacheAgeMs: now - cached.savedAt, partial: true, errors };
      }
      return {
        ok: false, source: 'indisponível', stamp: new Date().toISOString(), count: 0, globalCount: 0, brazilCount: 0,
        quakes: [], stale: false, partial: false, error: 'Nenhum catálogo sísmico respondeu.', errors,
        sources: sourceResults.map(({ data, ...meta }, index) => ({ ...meta, endpoint: SOURCE_DEFINITIONS[index].endpoint, kind: SOURCE_DEFINITIONS[index].kind, coverage: SOURCE_DEFINITIONS[index].coverage, cadence: SOURCE_DEFINITIONS[index].cadence })),
        coverage: coverageMetadata(),
      };
    }

    const sourceNames = usable.map((item) => item.label.split(' · ')[0]);
    const sourceStatuses = sourceResults.map(({ data, ...meta }, index) => ({
      ...meta,
      endpoint: SOURCE_DEFINITIONS[index].endpoint,
      kind: SOURCE_DEFINITIONS[index].kind,
      coverage: SOURCE_DEFINITIONS[index].coverage,
      cadence: SOURCE_DEFINITIONS[index].cadence,
    }));
    const result = {
      ok: true,
      source: sourceNames.join(' + '),
      stamp: new Date().toISOString(),
      count: quakes.length,
      globalCount: quakes.filter((q) => !isBrazilianEvent(q)).length,
      brazilCount: quakes.filter(isBrazilianEvent).length,
      quakes,
      stale: sourceResults.some((s) => s.stale),
      partial: sourceResults.some((s) => !s.ok || s.stale),
      errors,
      sources: sourceStatuses,
      coverage: coverageMetadata(),
    };
    state.cache.set(key, { savedAt: Date.now(), payload: result });
    return result;
  })().finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

// Exportado para testes isolados sem depender de chamadas externas.
export {
  parseFdsnQuakeML,
  parseLabSisBulletin,
  parseTableBasedBrazilianEvents,
  parseUnimontesRss,
  discoverUnimontesPdfLinks,
  parseSISBRAPrelim,
  mergeEvents,
  fromEMSC,
  fromUSGS,
};

// Feed sísmico combinado GeoGus.
// Global: USGS ComCat (primário) e EMSC (fallback).
// Brasil: catálogo FDSN Event do Centro de Sismologia da USP, que opera parte
// da RSBR e mantém dados paramétricos atualizados. O BSB consolidado é histórico
// (publicação estática), por isso não substitui o catálogo dinâmico para alertas.
const CACHE_TTL = 40_000;
const STALE_TTL = 20 * 60_000;
const REQUEST_TIMEOUT = 5_200;
const USP_TIMEOUT = 6_200;
const state = globalThis.__geogusEarthquakes ??= { cache: new Map(), inflight: new Map() };

const USP_EVENT_URL = 'https://www.moho.iag.usp.br/fdsnws/event/1/query';
const USP_EVENT_PAGE = 'https://moho.iag.usp.br/eq/latest';

function periodValue(value) {
  return ['day', 'week', 'month'].includes(String(value)) ? String(value) : 'week';
}
function magnitudeValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 1;
}
function periodDays(period) { return period === 'day' ? 1 : period === 'week' ? 7 : 30; }

async function fetchResponse(url, timeoutMs = REQUEST_TIMEOUT, accept = 'application/json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': 'GeoGus/1.0 (public seismology data integration)',
      },
    });
    if (response.status === 204) return { status: 204, text: '' };
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} em ${new URL(url).hostname}`), { status: response.status });
    return { status: response.status, text };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`Consulta excedeu ${Math.round(timeoutMs / 100) / 10}s em ${new URL(url).hostname}`);
    }
    throw error;
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT) {
  const { text } = await fetchResponse(url, timeoutMs, 'application/geo+json, application/json');
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error(`Resposta não JSON recebida de ${new URL(url).hostname}`); }
}

function fromUSGS(payload, minMag) {
  return (payload?.features || []).flatMap((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    const p = feature?.properties || {};
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    const mag = Number(p.mag);
    const time = Number(p.time);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(time) || !Number.isFinite(mag) || mag < minMag) return [];
    return [{
      id: String(feature.id), mag, magType: p.magType || '', place: p.place || 'Localização não informada',
      time, updated: Number(p.updated) || time, lat, lon, depthKm: Number(coordinates[2]) || 0,
      url: p.url || '', source: 'USGS', sources: ['USGS'], status: p.status || '', alert: p.alert || null,
      felt: p.felt == null ? null : Number(p.felt), tsunami: Number(p.tsunami) || 0,
    }];
  }).sort((a, b) => b.time - a.time);
}

function fromEMSC(payload, minMag) {
  return (payload?.features || []).flatMap((feature) => {
    const p = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates || [];
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    const mag = Number(p.mag);
    const time = Date.parse(p.time);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(time) || !Number.isFinite(mag) || mag < minMag) return [];
    const stableId = `${p.auth || 'EMSC'}-${p.eventid || feature.id || `${time}-${lat}-${lon}`}`;
    return [{
      id: stableId, mag, magType: p.magtype || '', place: p.ev_regionname || p.flynn_region || 'Região não informada',
      time, updated: Date.parse(p.last_update || p.time) || time, lat, lon, depthKm: Number(coordinates[2]) || 0,
      url: p.detail_url || 'https://www.seismicportal.eu/', source: 'EMSC', sources: ['EMSC'], status: p.ev_type || '',
      alert: null, felt: null, tsunami: 0,
    }];
  }).sort((a, b) => b.time - a.time);
}

// Leitor mínimo e tolerante de QuakeML. A USP publica o FDSN Event em QuakeML
// por padrão; não é necessário instalar um parser XML adicional no projeto.
function xmlBlocks(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`, 'gi');
  return [...String(xml || '').matchAll(re)].map((m) => ({ attrs: m[1] || '', inner: m[2] || '' }));
}
function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim()
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function xmlText(xml, tag) {
  const block = xmlBlocks(xml, tag)[0];
  return block ? decodeXml(block.inner) : '';
}
function xmlValue(xml, tag) {
  const block = xmlBlocks(xml, tag)[0];
  if (!block) return '';
  return xmlText(block.inner, 'value') || decodeXml(block.inner);
}
function xmlAttribute(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i');
  return re.exec(attrs)?.[1] || '';
}
function parseUSPFdsnQuakeML(xml, minMag = 0) {
  const text = String(xml || '');
  if (!text.trim()) return [];
  if (!/<(?:[\w.-]+:)?event\b/i.test(text)) {
    if (/Exception|error|invalid parameter/i.test(text)) throw new Error(`USP FDSN retornou resposta de erro: ${text.slice(0, 180)}`);
    return [];
  }
  const events = xmlBlocks(text, 'event');
  const quakes = [];
  for (const event of events) {
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
    if (lat < -35 || lat > 7 || lon < -75 || lon > -33) continue;

    const description = xmlBlocks(event.inner, 'description').map((d) => xmlText(d.inner, 'text')).find(Boolean) || '';
    const region = description.replace(/\s+/g, ' ').trim();
    const place = region
      ? (/brasil|brazil/i.test(region) ? region : `${region}, Brasil`)
      : 'Brasil · região catalogada pela USP/RSBR';
    const eventId = xmlAttribute(event.attrs, 'publicID') || `${time}-${lat.toFixed(3)}-${lon.toFixed(3)}`;
    const mode = xmlText(origin.inner, 'evaluationMode').toLowerCase();
    const evaluation = xmlText(origin.inner, 'evaluationStatus').toLowerCase();
    const status = mode === 'manual' || evaluation === 'confirmed' ? 'Revisado pela USP' : 'Automático · aguardando revisão';
    const magnitudeType = magnitude ? xmlText(magnitude.inner, 'type') : '';
    quakes.push({
      id: `USP-${eventId}`, mag, magType: magnitudeType || 'M', place,
      time, updated: time, lat, lon, depthKm: Number.isFinite(depthMeters) ? Math.max(0, depthMeters / 1000) : 0,
      url: USP_EVENT_PAGE, source: 'USP', sources: ['USP / RSBR'], status, alert: null, felt: null, tsunami: 0,
    });
  }
  return quakes.sort((a, b) => b.time - a.time);
}

function haversineKm(a, b) {
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function mergeBrazilAndGlobal(globalEvents, brazilEvents) {
  const result = [...brazilEvents];
  for (const global of globalEvents) {
    const matchIndex = result.findIndex((local) => Math.abs(local.time - global.time) <= 120_000 && haversineKm(local, global) <= 45);
    if (matchIndex >= 0) {
      const local = result[matchIndex];
      result[matchIndex] = {
        ...local,
        sources: [...new Set([...(local.sources || ['USP / RSBR']), ...(global.sources || [global.source])])],
        // Conserva a localização institucional brasileira, mas usa a URL e a
        // magnitude global apenas como referência complementar quando útil.
        url: local.url || global.url,
        magType: local.magType || global.magType,
      };
    } else result.push(global);
  }
  return result.sort((a, b) => b.time - a.time);
}

function uspQueryUrl(period, minMag) {
  const params = new URLSearchParams({
    starttime: new Date(Date.now() - periodDays(period) * 86_400_000).toISOString(),
    endtime: new Date().toISOString(),
    minlatitude: '-34', maxlatitude: '6',
    minlongitude: '-74', maxlongitude: '-34',
    minmagnitude: String(minMag),
    limit: '500', orderby: 'time',
    includearrivals: 'false', includeallorigins: 'false', includeallmagnitudes: 'false',
  });
  return `${USP_EVENT_URL}?${params.toString()}`;
}

async function loadUSGS(period, minMag) {
  const tier = minMag >= 4.5 ? '4.5' : minMag >= 2.5 ? '2.5' : 'all';
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${tier}_${period}.geojson`;
  return fromUSGS(await fetchJson(url), minMag);
}
async function loadUSP(period, minMag) {
  const { text } = await fetchResponse(uspQueryUrl(period, minMag), USP_TIMEOUT, 'application/xml, text/xml;q=0.9');
  return parseUSPFdsnQuakeML(text, minMag);
}
async function loadEMSC(period, minMag) {
  const days = periodDays(period);
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);
  const params = new URLSearchParams({ format: 'json', starttime: start, minmagnitude: String(minMag), limit: '1000', orderby: 'time' });
  return fromEMSC(await fetchJson(`https://www.seismicportal.eu/fdsnws/event/1/query?${params.toString()}`), minMag);
}

export async function getEarthquakeFeed(periodInput = 'week', minMagInput = 1) {
  const period = periodValue(periodInput);
  const minMag = magnitudeValue(minMagInput);
  const key = `${period}:${minMag.toFixed(1)}`;
  const now = Date.now();
  const cached = state.cache.get(key);
  if (cached && now - cached.savedAt < CACHE_TTL) return { ...cached.payload, cached: true, cacheAgeMs: now - cached.savedAt };
  if (state.inflight.has(key)) return state.inflight.get(key);

  const task = (async () => {
    const [globalResult, uspResult] = await Promise.allSettled([
      loadUSGS(period, minMag),
      loadUSP(period, minMag),
    ]);

    let globalEvents = [];
    let globalSource = 'USGS';
    let globalError = '';
    let uspEvents = [];
    let uspError = '';

    if (globalResult.status === 'fulfilled') globalEvents = globalResult.value;
    else {
      globalError = String(globalResult.reason?.message || globalResult.reason);
      try {
        globalEvents = await loadEMSC(period, minMag);
        globalSource = 'EMSC';
      } catch (error) {
        globalError += `; EMSC: ${String(error?.message || error)}`;
        globalSource = '';
      }
    }
    if (uspResult.status === 'fulfilled') uspEvents = uspResult.value;
    else uspError = String(uspResult.reason?.message || uspResult.reason);

    const usable = globalSource || uspResult.status === 'fulfilled';
    if (!usable) {
      const message = `Fontes sísmicas indisponíveis — USGS/EMSC: ${globalError}; USP/RSBR: ${uspError}`;
      if (cached && now - cached.savedAt < STALE_TTL) {
        return { ...cached.payload, stale: true, cached: true, cacheAgeMs: now - cached.savedAt, error: message };
      }
      return {
        ok: false, source: 'indisponível', stamp: new Date().toISOString(), count: 0, globalCount: 0, brazilCount: 0,
        quakes: [], stale: false, error: message,
        sources: [
          { id: 'usgs', label: 'USGS', ok: false, count: 0, error: globalError },
          { id: 'usp-rsbr', label: 'USP / RSBR', ok: false, count: 0, error: uspError },
        ],
      };
    }

    const quakes = mergeBrazilAndGlobal(globalEvents, uspEvents);
    const sourceNames = [];
    if (globalSource) sourceNames.push(globalSource);
    if (uspResult.status === 'fulfilled') sourceNames.push('USP / RSBR');
    const result = {
      ok: true,
      source: sourceNames.join(' + ') || 'USP / RSBR',
      stamp: new Date().toISOString(),
      count: quakes.length,
      globalCount: globalEvents.length,
      brazilCount: uspEvents.length,
      quakes,
      stale: false,
      partial: Boolean(globalError || uspError),
      errors: [globalError, uspError].filter(Boolean),
      sources: [
        { id: globalSource === 'EMSC' ? 'emsc' : 'usgs', label: globalSource || 'USGS', ok: Boolean(globalSource), count: globalEvents.length, error: globalError || undefined },
        { id: 'usp-rsbr', label: 'USP / RSBR', ok: uspResult.status === 'fulfilled', count: uspEvents.length, error: uspError || undefined },
      ],
    };
    state.cache.set(key, { savedAt: Date.now(), payload: result });
    return result;
  })().finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

// Exportado para testes locais de parser sem depender de consulta externa.
export { parseUSPFdsnQuakeML, mergeBrazilAndGlobal };

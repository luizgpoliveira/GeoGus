// Proxy same-origin para terremotos. Mantém o USGS como fonte primária e EMSC como fallback,
// com cache curto, deduplicação de chamadas e último resultado válido em caso de falha.
const CACHE_TTL = 40_000;
const STALE_TTL = 15 * 60_000;
const REQUEST_TIMEOUT = 5_500;
const state = globalThis.__geogusEarthquakes ??= { cache: new Map(), inflight: new Map() };

function periodValue(value) {
  return ['day', 'week', 'month'].includes(String(value)) ? String(value) : 'week';
}
function magnitudeValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 1;
}
function feedTier(minMag) {
  if (minMag >= 4.5) return '4.5';
  if (minMag >= 2.5) return '2.5';
  if (minMag >= 1) return '1.0';
  return 'all';
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/geo+json, application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).hostname}`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error(`Consulta sísmica excedeu ${REQUEST_TIMEOUT / 1000}s`);
    throw error;
  } finally { clearTimeout(timer); }
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
      url: p.url || '', source: 'USGS', status: p.status || '', alert: p.alert || null,
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
      url: p.detail_url || 'https://www.seismicportal.eu/', source: 'EMSC', status: p.ev_type || '',
      alert: null, felt: null, tsunami: 0,
    }];
  }).sort((a, b) => b.time - a.time);
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
    let upstreamError = '';
    try {
      const tier = feedTier(minMag);
      const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${tier}_${period}.geojson`;
      const payload = await fetchJson(url);
      const quakes = fromUSGS(payload, minMag);
      const result = { ok: true, source: 'USGS', stamp: new Date().toISOString(), count: quakes.length, quakes, stale: false };
      state.cache.set(key, { savedAt: Date.now(), payload: result });
      return result;
    } catch (error) {
      upstreamError = String(error?.message || error);
    }

    try {
      const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);
      const url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&starttime=${encodeURIComponent(start)}&minmagnitude=${encodeURIComponent(minMag)}&limit=1000&orderby=time`;
      const payload = await fetchJson(url);
      const quakes = fromEMSC(payload, minMag);
      const result = { ok: true, source: 'EMSC', stamp: new Date().toISOString(), count: quakes.length, quakes, stale: false, upstreamError };
      state.cache.set(key, { savedAt: Date.now(), payload: result });
      return result;
    } catch (fallbackError) {
      const message = `${upstreamError}; fallback EMSC: ${String(fallbackError?.message || fallbackError)}`;
      if (cached && now - cached.savedAt < STALE_TTL) {
        return { ...cached.payload, stale: true, cached: true, cacheAgeMs: now - cached.savedAt, error: message };
      }
      return { ok: false, source: null, stamp: new Date().toISOString(), count: 0, quakes: [], stale: false, error: message };
    }
  })().finally(() => state.inflight.delete(key));
  state.inflight.set(key, task);
  return task;
}

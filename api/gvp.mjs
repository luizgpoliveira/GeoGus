const GVP_WFS = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs';
const USER_AGENT = 'GeoGus/1.0 (volcano monitoring; public data client)';
const cache = globalThis.__geogusGvpCache ??= new Map();
const inflight = globalThis.__geogusGvpInflight ??= new Map();
const TTL_ERUPTION = 10 * 60_000;
const TTL_CATALOG = 12 * 60 * 60_000;
const MAX_QUERY_LENGTH = 7000;

function responseError(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error, source: 'Smithsonian GVP' });
}

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return responseError(res, 405, 'Método não permitido.');
  }

  const rawQuery = typeof req.query?.q === 'string'
    ? req.query.q
    : new URL(req.url, 'https://geogus.invalid').searchParams.get('q') || '';

  if (!rawQuery) return responseError(res, 400, 'Parâmetro q obrigatório.');
  if (rawQuery.length > MAX_QUERY_LENGTH) return responseError(res, 413, 'Consulta GVP excede o tamanho permitido.');

  const params = new URLSearchParams(rawQuery);
  const service = params.get('service');
  const request = params.get('request');
  if (service?.toUpperCase() !== 'WFS' || request?.toLowerCase() !== 'getfeature') {
    return responseError(res, 400, 'Somente consultas WFS GetFeature são permitidas.');
  }

  const key = params.toString();
  const hit = cache.get(key);
  const ttl = /ContinuingEruption/i.test(key) ? TTL_ERUPTION : TTL_CATALOG;
  if (hit && Date.now() - hit.savedAt < ttl) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-GeoGus-Cache', 'HIT');
    return res.status(200).send(hit.body);
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const target = `${GVP_WFS}?${params.toString()}`;
        const upstream = await fetch(target, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: controller.signal,
        });
        const body = await upstream.text();
        if (!upstream.ok) {
          const error = new Error(`Smithsonian GVP HTTP ${upstream.status}`);
          error.status = upstream.status;
          throw error;
        }
        const contentType = upstream.headers.get('content-type') || '';
        if (!/json/i.test(contentType) && !/^[\s]*[\[{]/.test(body)) {
          throw new Error('Smithsonian GVP retornou conteúdo que não é JSON.');
        }
        JSON.parse(body); // valida JSON antes de colocar no cache
        const entry = { body, savedAt: Date.now() };
        cache.set(key, entry);
        return entry;
      } catch (error) {
        if (controller.signal.aborted) throw new Error('Smithsonian GVP excedeu o tempo limite de 12 segundos.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    })();
    inflight.set(key, pending);
  }

  try {
    const result = await pending;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-GeoGus-Cache', hit ? 'REVALIDATED' : 'MISS');
    return res.status(200).send(result.body);
  } catch (error) {
    if (hit?.body) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-GeoGus-Cache', 'STALE');
      res.setHeader('X-GeoGus-Upstream-Error', String(error?.message || error).slice(0, 160));
      return res.status(200).send(hit.body);
    }
    const status = Number(error?.status) || 502;
    return responseError(res, status, String(error?.message || error).slice(0, 500));
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

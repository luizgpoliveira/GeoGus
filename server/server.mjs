// Proxy + servidor estático para o TerraPulse (sem dependências externas).
// O GVP (webservices.volcano.si.edu) não envia cabeçalhos CORS, então o frontend
// consome o catálogo do Smithsonian exclusivamente via /api/gvp com cache em memória.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPhivolcs, getPvmbg, getUsgs, getUsgsStatus, getReports } from './reports.mjs';
import { getTsunamiAlerts } from './tsunami.mjs';
import { getEarthquakeFeed } from './earthquakes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const BASE = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs';
const PORT = Number(process.env.PORT || 8787);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const cache = new Map(); // q -> { t, status, ct, body }
const proxyInflight = new Map(); // evita consultas WFS idênticas em paralelo
const TTL_ERUP = 2 * 60_000;   // erupções em curso: 10 min
const TTL_LOCAL = 6 * 3600e3;   // detalhes por vulcão: 6 h
const TTL_CAT = 12 * 3600e3;    // catálogos completos: 12 h

const TTL_OBS = 15 * 60_000;    // observatórios nacionais: 15 min
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function ttlFor(q) {
  if (q.includes('ContinuingEruption')) return TTL_ERUP;
  if (/VolcanoNumber%3D|%3D\d{6}/.test(q)) return TTL_LOCAL;
  return TTL_CAT;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/gvp' || url.pathname === '/api/gvp/') {
    const q = url.searchParams.get('q') || '';
    if (!q) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'missing q' })); }
    const key = q;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttlFor(key)) {
      res.writeHead(200, { 'Content-Type': hit.ct, 'Cache-Control': 'public, max-age=60', 'X-Cache': 'HIT', 'X-Cache-Age': String(Math.round((Date.now() - hit.t) / 1000)) });
      return res.end(hit.body);
    }
    let pending = proxyInflight.get(key);
    if (!pending) {
      pending = (async () => {
        const target = `${BASE}?${q}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const upstream = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controller.signal });
          const body = Buffer.from(await upstream.arrayBuffer());
          if (!upstream.ok) throw Object.assign(new Error(`GVP HTTP ${upstream.status}`), { status: upstream.status });
          const entry = { t: Date.now(), status: 200, ct: 'application/json; charset=utf-8', body };
          cache.set(key, entry);
          return entry;
        } catch (error) {
          if (controller.signal.aborted) throw new Error('GVP WFS timeout após 10s');
          throw error;
        } finally { clearTimeout(timer); }
      })();
      proxyInflight.set(key, pending);
    }
    try {
      const result = await pending;
      res.writeHead(200, { 'Content-Type': result.ct, 'Cache-Control': 'public, max-age=60', 'X-Cache': 'MISS' });
      return res.end(result.body);
    } catch (error) {
      if (hit?.body) {
        res.writeHead(200, { 'Content-Type': hit.ct, 'X-Cache': 'STALE', 'X-Upstream-Error': String(error.message || error).slice(0, 180) });
        return res.end(hit.body);
      }
      const status = Number(error.status) || 502;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: String(error.message || error), upstream: 'Smithsonian GVP WFS' }));
    } finally {
      if (proxyInflight.get(key) === pending) proxyInflight.delete(key);
    }
  }

  // Healthcheck local: permite diferenciar backend parado de fonte externa indisponível.
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'GeoGus API', port: PORT, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() }));
  }

  // Observatórios nacionais + central de relatórios (coleta/interpretação em reports.mjs).
  const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  // limite de espera: fonte lenta responde erro em vez de deixar o cliente pendurado
  const cap = async (promise, ms, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1000)}s`)), ms); timer.unref?.(); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  };
  try {
    if (url.pathname === '/api/phivolcs') {
      const data = await cap(getPhivolcs(), 15_000, 'PHIVOLCS');
      return json({ ...data.body, stamp: new Date(data.updatedAt || Date.now()).toISOString(), stale: !!data.stale, cacheAgeMs: data.cacheAgeMs || 0 });
    }
    if (url.pathname === '/api/pvmbg') {
      const data = await cap(getPvmbg(), 8_500, 'PVMBG');
      return json({ ...data.body, stamp: new Date(data.updatedAt || Date.now()).toISOString(), stale: !!data.stale, cacheAgeMs: data.cacheAgeMs || 0 });
    }
    if (url.pathname === '/api/usgs') {
      const data = await cap(getUsgsStatus(), 9_000, 'USGS HANS');
      return json({ ...data.body, stamp: new Date(data.updatedAt || Date.now()).toISOString(), stale: !!data.stale, cacheAgeMs: data.cacheAgeMs || 0 });
    }
    if (url.pathname === '/api/reports') {
      const force = url.searchParams.get('force') === '1';
      return json(await cap(getReports(force), 34_000, 'Central de relatórios'));
    }
    if (url.pathname === '/api/earthquakes') {
      const period = url.searchParams.get('period') || 'day';
      const minMag = url.searchParams.get('minMag') || '1';
      const result = await cap(getEarthquakeFeed(period, minMag), 12_000, 'Central sísmica multiorigem');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return json(result, result.ok ? 200 : 503);
    }
    if (url.pathname === '/api/tsunami') {
      const force = url.searchParams.get('force') === '1';
      const result = await cap(getTsunamiAlerts(force), 10_000, 'Alertas de tsunami NOAA');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return json(result, result.ok ? 200 : 503);
    }
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) });
  }

  // Nunca devolver index.html para uma rota /api desconhecida: o frontend espera JSON.
  // Isso evita mascarar erros de rota com 'Unexpected token <'.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return json({ ok: false, error: `Endpoint de API não encontrado: ${url.pathname}` }, 404);
  }

  // estático (dist)
  let p = join(DIST, decodeURIComponent(url.pathname));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  const ext = extname(p);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(p));
});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => console.log(`TerraPulse server em http://127.0.0.1:${PORT}`));

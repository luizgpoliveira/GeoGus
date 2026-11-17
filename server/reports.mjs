// Coletor e interpretador de relatórios vulcânicos (fontes oficiais + notícias).
// Interpretação determinística por regras (sem alucinação); IA opcional via env.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TTL_OBS = 10 * 60_000;
// Cache curto para níveis de alerta operacionais; notícias e relatórios mantêm TTL maior.
const TTL_VOLCANO_ALERTS = 45 * 1000;
const TTL_REPORTS = 5 * 60_000;
const TTL_CAT = 12 * 3600e3;
const SOURCE_TIMEOUT = { catalog: 8_000, phivolcs: 7_000, bulletin: 3_500, pvmbg: 7_000, usgs: 7_000, news: 5_500, gvp: 6_000, ai: 4_000 };
const FAILURE_BACKOFF = 2 * 60_000;
const GVP_BLOCK_BACKOFF = 60 * 60_000;
const GVP_TRANSIENT_BACKOFF = 5 * 60_000;
const GNEWS_QS = [
  'volcano eruption OR volcanic activity',
  'Fuego OR Santiaguito OR Popocatepetl OR Reventador OR Sangay OR Sabancaya OR Kilauea volcano',
  'Etna OR Stromboli OR Sheveluch OR Mayon OR Merapi OR Taal OR Dukono OR Semeru OR Ibu OR Kanlaon volcano',
];

const mem = new Map(); // cache genérico {t, body, failedAt, lastError} ou {t, error}
const inFlight = new Map();
async function cachedFetch(key, ttl, fetcher, failureTtl = FAILURE_BACKOFF) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit?.body && now - hit.t < ttl) {
    return { body: hit.body, cached: true, updatedAt: hit.t, cacheAgeMs: now - hit.t };
  }
  if (hit?.body && hit.failedAt && now - hit.failedAt < failureTtl) {
    const staleBody = { ...hit.body, stale: true, errors: [...(hit.body.errors || []), `Atualização temporariamente indisponível; mantendo cache anterior (${hit.lastError}).`] };
    return { body: staleBody, cached: true, stale: true, updatedAt: hit.t, cacheAgeMs: now - hit.t };
  }
  if (hit?.error && now - hit.t < failureTtl) throw hit.error;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    try {
      const body = await fetcher();
      const savedAt = Date.now();
      mem.set(key, { t: savedAt, body });
      return { body, cached: false, updatedAt: savedAt, cacheAgeMs: 0 };
    } catch (error) {
      const message = String(error?.message || error);
      if (hit?.body) {
        mem.set(key, { ...hit, failedAt: Date.now(), lastError: message });
        return {
          body: { ...hit.body, stale: true, errors: [...(hit.body.errors || []), `Atualização falhou; dados anteriores mantidos: ${message}`] },
          cached: true, stale: true, updatedAt: hit.t, cacheAgeMs: Date.now() - hit.t,
        };
      }
      mem.set(key, { t: Date.now(), error: new Error(message) });
      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

async function fetchBodyWithTimeout(url, init = {}, timeoutMs = SOURCE_TIMEOUT.news, parse = (response) => response.text()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await parse(response); // mantém o timeout ativo até o corpo ser completamente lido
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new Error(`timeout após ${Math.round(timeoutMs / 100) / 10}s: ${new URL(url).hostname}`);
    }
    throw error;
  } finally { clearTimeout(timer); }
}
const fetchTextWithTimeout = (url, init = {}, timeoutMs = SOURCE_TIMEOUT.news) =>
  fetchBodyWithTimeout(url, init, timeoutMs, (response) => response.text());
const fetchJSONWithTimeout = (url, init = {}, timeoutMs = SOURCE_TIMEOUT.news) =>
  fetchBodyWithTimeout(url, init, timeoutMs, (response) => response.json());

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      try { results[index] = await worker(values[index], index); }
      catch (error) { results[index] = { __error: error }; }
    }
  });
  await Promise.all(workers);
  return results;
}

async function getHTML(url, timeoutMs = SOURCE_TIMEOUT.news, extraHeaders = {}) {
  return fetchTextWithTimeout(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.7',
      ...extraHeaders,
    },
  }, timeoutMs);
}
const stripTags = (t) => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const decodeEntities = (value) => String(value || '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '\"').replace(/&apos;|&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const cleanHtml = (value) => decodeEntities(String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
/** Tokens normalizados (mantém limites de palavra). */
const words = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/* ============================ Catálogo GVP p/ associação ============================ */
let catalog = null; // { t, list: [{ vn, name, country, words }] }
let catalogPromise = null;
let catalogFailedAt = 0;
async function getCatalog() {
  if (catalog && Date.now() - catalog.t < TTL_CAT) return catalog.list;
  if (catalog && catalogFailedAt && Date.now() - catalogFailedAt < FAILURE_BACKOFF) return catalog.list;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const q = 'service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&typeNames=GVP-VOTW:E3WebApp_HoloceneVolcanoes&propertyName=VolcanoNumber,VolcanoName,Country&count=2000';
    try {
      const j = await fetchJSONWithTimeout(`https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs?${q}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, SOURCE_TIMEOUT.catalog);
      const list = [];
      const byName = new Map();
      for (const f of j.features ?? []) {
        const p = f.properties || {};
        if (!p.VolcanoName) continue;
        const info = { vn: p.VolcanoNumber, name: p.VolcanoName, country: p.Country || '—', words: words(p.VolcanoName) };
        list.push(info);
        byName.set(norm(p.VolcanoName), info);
      }
      const alias = { santiaguito: 'santamaria', santamariadome: 'santamaria', kilauea: 'kilauea' };
      for (const [a, target] of Object.entries(alias)) {
        const hit = byName.get(target);
        if (hit) list.push({ ...hit, words: [a] });
      }
      catalog = { t: Date.now(), list };
      catalogFailedAt = 0;
      return list;
    } catch (error) {
      catalogFailedAt = Date.now();
      if (catalog?.list?.length) return catalog.list;
      throw error;
    } finally { catalogPromise = null; }
  })();
  return catalogPromise;
}
/** Nomes do catálogo que também são palavras comuns em notícias: exigem contexto vulcânico. */
const AMBIGUOUS = new Set([
  'morning', 'late', 'wolf', 'hood', 'ruby', 'brothers', 'fisher', 'baker', 'martin', 'clark',
  'hayes', 'herbert', 'douglas', 'adams', 'santiago', 'granada', 'berlin', 'flores', 'mare',
  'pico', 'tana', 'dana', 'madeira', 'cay', 'agua',
]);
const VOLCANO_CTX = new Set(['volcano', 'volcan', 'volcanes', 'gunung', 'mount', 'vulcao']);
/** Subsequência contígua de palavras (nomes de vulcão são curtos). */
const includesWords = (hay, needle, requireCtx = false) => {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let k = 0; k < needle.length; k++) if (hay[i + k] !== needle[k]) { ok = false; break; }
    if (!ok) continue;
    if (!requireCtx) return true;
    const next = hay[i + needle.length];
    if (next && VOLCANO_CTX.has(next)) return true;
  }
  return false;
};
/** Encontra o vulcão do catálogo num texto (título). */
async function matchVolcano(text) {
  const list = await getCatalog();
  const tw = words(text);
  let best = null;
  for (const info of list) {
    const key = info.words.join(' ');
    if (includesWords(tw, info.words, AMBIGUOUS.has(key)) && (!best || info.words.length > best.words.length)) best = info;
  }
  return best ?? null;
}
/** Todos os vulcões do catálogo mencionados no texto (para títulos com vários nomes). */
export async function matchVolcanoes(text) {
  const list = await getCatalog();
  const tw = words(text);
  const out = [];
  const seenVn = new Set();
  for (const info of list) {
    const key = info.words.join(' ');
    if (includesWords(tw, info.words, AMBIGUOUS.has(key)) && !seenVn.has(info.vn)) { seenVn.add(info.vn); out.push(info); }
  }
  return out;
}

/* ============================ Interpretador (regras, multilíngue) ============================ */
const RULES = [
  ['EXPLOSIVA', /explosiv|eksplosif|explosión|dome collapse|colapso/i],
  ['CINZAS', /\b(ash|cinza|abu vulkanik|ceniza)\b/i],
  ['STROMBOLIANA', /strombol/i],
  ['LAVA', /lava|effusi|efusiv|derrame/i],
  ['PIROCLASTICO', /piroclast|pyroclast|guguran|awan panas|flujo de/i],
  ['LAHAR', /\blahar\b|debris flow|deslizamiento/i],
  ['INCANDESCENCIA', /incandes|glow|panas/i],
  ['SISMICIDADE', /earthquake|volcanic tremor|gempa vulkanik|sismo|terremoto|seismic/i],
  ['GASES', /so2|sulfur dioxide|gas emission|fumarol|emisi gas/i],
  ['ERUPCAO_MODERADA', /moderate.*?(erupt|explosi)|low-level eruption|freatomagmat/i],
  ['INQUIETACAO', /unrest|inquietação|waspada|takut|awas|siaga|advisory/i],
  // ERUPCAO exige descrição textual explícita de atividade em andamento.
];
const ACTIVE_ERUPTION = /\b(?:ongoing|continuing|underway|in progress)\b[^.\n]{0,45}\beruption\b|\berupt(?:ion|ive activity)\b[^.\n]{0,90}\b(?:ongoing|continues|continuing|underway|in progress|currently active)\b|\b(?:is|are|remains|continues to be)\s+(?:currently\s+)?erupting\b|\bcurrently erupting\b|\bactively erupting\b|\bfountaining\b[^.\n]{0,45}\b(?:continues|continuing|ongoing|underway)\b|\berupsi\b[^.\n]{0,80}\b(?:sedang berlangsung|masih berlangsung|terus berlangsung|berlanjut)\b|\b(?:sedang|masih)\s+(?:terjadi\s+)?erupsi\b|\bletusan\b[^.\n]{0,80}\b(?:sedang berlangsung|masih berlangsung|terus berlangsung)\b/i;
const ERUPTION_GAP = /\b(?:no|without|not|ceased|stopped|paused|ended|no longer)\b[^.\n]{0,55}\beruption\b|\b(?:not|no longer|not currently)\s+(?:currently\s+)?erupting\b|\beruption\b[^.\n]{0,65}\b(?:paused|ended|stopped|ceased|no longer|not occurring|not ongoing|has ended)\b|\bfountaining\b[^.\n]{0,35}\b(?:stopped|ceased|ended|not occurring)\b|\b(?:tidak|belum|bukan)\b[^.\n]{0,45}\berupsi\b|\berupsi\b[^.\n]{0,65}\b(?:berakhir|berhenti|selesai|tidak(?:\s+sedang)?\s+berlangsung|tidak lagi berlangsung|telah\s+berhenti)\b|\b(?:letusan|erupsi)\b[^.\n]{0,55}\b(?:sudah berakhir|telah berakhir|tidak berlanjut)\b/i;
/** Texto oficial descreve erupção em curso (e não pausada/encerrada)? */
const isEruptiveText = (t) => ACTIVE_ERUPTION.test(t) && !ERUPTION_GAP.test(t);
function interpret(text) {
  const t = text || '';
  const cats = RULES.filter(([, re]) => re.test(t)).map(([c]) => c);
  if (isEruptiveText(t) && !cats.includes('ERUPCAO')) cats.unshift('ERUPCAO');
  let ashKm = null;
  const km = t.match(/(?:ash|plume|column|cinza|abu|ceniza|pluma)[^.\n]{0,160}?(\d+(?:[.,]\d+)?)\s*(?:km|kilometers?|kilometres?)\b/i);
  const meters = t.match(/(?:ash|plume|column|cinza|abu|ceniza|pluma)[^.\n]{0,160}?(\d{2,5})\s*(?:m|metros|meters)\b/i)
    || t.match(/(\d{2,5})\s*(?:m|metros|meters)\b[^.\n]{0,80}?(?:above the crater|dari puncak|de altura|acima)/i);
  if (km) ashKm = Number(km[1].replace(',', '.'));
  else if (meters) ashKm = Math.round((Number(meters[1]) / 10)) / 100;
  const erupting = /erupsi|erupción|eruption|letusan/i.test(t);
  return { cats, ashKm, erupting };
}

/* ============================ Coletores ============================ */
export async function getPhivolcs() {
  return cachedFetch('phivolcs', TTL_VOLCANO_ALERTS, async () => {
    const errors = [];
    let html = '';
    try {
      html = await getHTML('https://wovodat.phivolcs.dost.gov.ph/bulletin/list-of-bulletin', SOURCE_TIMEOUT.phivolcs);
    } catch (error) {
      errors.push(`Lista de boletins: ${error.message || error}`);
      // A página inicial oficial também publica os níveis atuais; serve como fallback leve.
      try { html = await getHTML('https://wovodat.phivolcs.dost.gov.ph/', 4_000); }
      catch (fallbackError) { errors.push(`Página inicial: ${fallbackError.message || fallbackError}`); }
    }
    if (!html) throw new Error(errors.join('; ') || 'PHIVOLCS não respondeu.');

    const plain = stripTags(html);
    const out = { ok: true, levels: {}, bulletins: {}, details: {}, errors, items: [] };
    for (const [, name, lvl] of plain.matchAll(/(Taal|Kanlaon|Mayon|Bulusan|Pinatubo)\s*-\s*(\d+)/g)) out.levels[name] = Number(lvl);
    if (!Object.keys(out.levels).length) out.errors.push('PHIVOLCS: a página respondeu, mas os níveis não foram reconhecidos.');
    for (const [, name, d] of plain.matchAll(/([A-Za-z-]+)\s+Volcano\s+Summary of 24Hr Observation\s+(\d{1,2}\s+\w+\s+\d{4})/g)) out.bulletins[name] = d;

    const CODE = { mvo: 'Mayon', tvo: 'Taal', kvo: 'Kanlaon', bvo: 'Bulusan', pvo: 'Pinatubo' };
    const bids = {};
    for (const m of html.matchAll(/\/bulletin\/activity-(mvo|tvo|kvo|bvo|pvo)\?bid=(\d+)/g)) if (!bids[m[1]]) bids[m[1]] = Number(m[2]);

    // Detalhes são enriquecimento: não podem bloquear os níveis oficiais da página principal.
    const detailEntries = Object.entries(bids).slice(0, 3); // níveis dos demais vulcões já vêm na listagem oficial
    const detailResults = await mapLimit(detailEntries, 3, async ([code, bid]) => {
      const name = CODE[code];
      const url = `https://wovodat.phivolcs.dost.gov.ph/bulletin/activity-${code}?bid=${bid}&lang=en`;
      const text = (await fetchTextWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, SOURCE_TIMEOUT.bulletin)).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').split('\n').map((v) => v.trim()).filter(Boolean).join('\n');
      const levelMatch = text.match(/ALERT LEVEL\s*\n?\s*(\d)/);
      const level = levelMatch ? Number(levelMatch[1]) : null;
      const date = text.match(/Date:\s*(\d{1,2}\s+\w+\s+\d{4})/)?.[1];
      const desc = text.match(/\(([^)]+)\)\s*\n?\s*ALERT LEVEL/)?.[1];
      const eqs = text.match(/(\d+)\s*\nvolcanic earthquakes/)?.[0].replace('\n', ' ');
      const so2 = text.match(/Sulfur Dioxide Flux\s*\n([^\n]+)/)?.[1];
      const plume = text.match(/Plume\s*\n([^\n]+)/)?.[1];
      if (level !== null) out.levels[name] = level;
      if (date) out.bulletins[name] = date;
      const det = {};
      if (desc) det.desc = desc; if (eqs) det.eqs = eqs; if (so2) det.so2 = so2; if (plume) det.plume = plume;
      if (Object.keys(det).length) out.details[name] = det;
      const interpreted = interpret(text.replace(/PHIVOLCS-LAVA:\s*/g, ''));
      interpreted.cats = interpreted.cats.filter((c) => c !== 'ERUPCAO');
      if (isEruptiveText(text)) interpreted.cats.unshift('ERUPCAO');
      let volcano = null;
      try { volcano = await matchVolcano(`${name} volcano philippines`); } catch { /* níveis continuam disponíveis sem associação GVP */ }
      if (volcano && date) out.items.push({
        id: `phivolcs-${bid}`, ts: Date.parse(date) || Date.now(), date,
        source: 'PHIVOLCS', kind: 'OFICIAL', verified: 'CONFIRMADO',
        title: `${name} Volcano Bulletin — Alert Level ${level ?? '?'}`, url,
        volcanoVn: volcano.vn, volcanoName: volcano.name, country: volcano.country,
        text: [det.eqs, det.so2 ? 'SO₂: ' + det.so2 : null, det.plume].filter(Boolean).join(' · ') || text.slice(0, 300),
        cats: interpreted.cats, ashKm: interpreted.ashKm, period: '24h',
      });
      return name;
    });
    for (let i = 0; i < detailResults.length; i++) {
      if (detailResults[i]?.__error) out.errors.push(`${detailEntries[i]?.[0] || 'Boletim'}: ${detailResults[i].__error.message || detailResults[i].__error}`);
    }
    out.ok = Object.keys(out.levels).length > 0;
    return out;
  });
}

export async function getPvmbg() {
  return cachedFetch('pvmbg', TTL_VOLCANO_ALERTS, async () => {
    const [tingkatResult, laporanResult] = await Promise.allSettled([
      getHTML('https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas', SOURCE_TIMEOUT.pvmbg),
      getHTML('https://magma.esdm.go.id/v1/gunung-api/laporan', SOURCE_TIMEOUT.pvmbg),
    ]);
    const out = { ok: false, levels: {}, items: [], errors: [] };
    const levelNumber = { IV: 4, III: 3, II: 2, I: 1 };

    if (tingkatResult.status === 'fulfilled') {
      const text = tingkatResult.value.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ');
      const base = text.indexOf('Daftar Tingkat Aktivitas');
      const detail = base >= 0 ? text.slice(base) : text;
      const marks = ['Level IV (Awas)', 'Level III (Siaga)', 'Level II (Waspada)', 'Level I (Normal)']
        .map((m) => ({ m, i: detail.indexOf(m) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
      marks.forEach((cur, k) => {
        const roman = cur.m.match(/Level (IV|III|II|I)\b/)?.[1];
        const level = roman ? levelNumber[roman] : null;
        if (level == null) return;
        const seg = detail.slice(cur.i + cur.m.length, k + 1 < marks.length ? marks[k + 1].i : undefined);
        for (const m2 of seg.matchAll(/([A-Z\u00C0-\u00FA][A-Za-z\u00C0-\u00FA'()\.\- ]{2,40}?) - [^|]+/g)) {
          const name = m2[1].trim();
          if (name && !/^(Level|Hasil|Tidak|yaitu Gunung)$/.test(name)) out.levels[name] = level;
        }
      });
      if (!Object.keys(out.levels).length) out.errors.push('PVMBG: a página de níveis respondeu, mas o formato não foi reconhecido.');
    } else {
      out.errors.push(`PVMBG níveis: ${tingkatResult.reason?.message || tingkatResult.reason}`);
    }

    if (laporanResult.status === 'fulfilled') {
      const lt = laporanResult.value.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/(\|\s*\|)+/g, '|').replace(/\s+/g, ' ');
      const MONTHS = { Januari: '01', Februari: '02', Maret: '03', April: '04', Mei: '05', Juni: '06', Juli: '07', Agustus: '08', September: '09', Oktober: '10', November: '11', Desember: '12' };
      const rows = [...lt.matchAll(/\|\s*([A-Z\u00C0-\u00FA][^|]{1,38})(?:\s*\|)+\s*(Level [IVX]+ \([^)]+\))[\s\S]{0,140}?-\s*([A-Za-z]+),\s*(\d{1,2})\s+(\w+)\s+(\d{4})(?:\s*\|)+\s*([^|]{20,600})/g)];
      for (const m of rows.slice(0, 40)) {
        const name = m[1].trim(), levelText = m[2], iso = `${m[6]}-${MONTHS[m[5]] || '01'}-${String(m[4]).padStart(2, '0')}`;
        const desc = m[7].trim();
        const roman = levelText.match(/Level (IV|III|II|I)\b/)?.[1];
        const level = roman ? levelNumber[roman] : null;
        if (level !== null && !out.levels[name]) out.levels[name] = level;
        let volcano = null;
        try { volcano = await matchVolcano(name + ' gunung api indonesia'); } catch { /* nível textual permanece disponível */ }
        if (!volcano) continue;
        const ip = interpret(desc);
        ip.cats = ip.cats.filter((c) => c !== 'ERUPCAO');
        if (isEruptiveText(desc)) ip.cats.unshift('ERUPCAO');
        out.items.push({
          id: `pvmbg-${norm(volcano.name)}-${iso}-${norm(String(desc).slice(0, 20))}`, ts: Date.parse(iso) || Date.now(), date: iso,
          source: 'PVMBG', kind: 'OFICIAL', verified: 'CONFIRMADO', title: `${volcano.name} — Laporan Aktivitas (${levelText})`,
          url: 'https://magma.esdm.go.id/v1/gunung-api/laporan', volcanoVn: volcano.vn, volcanoName: volcano.name, country: volcano.country,
          text: desc, cats: ip.cats, ashKm: ip.ashKm, period: m[0].match(/Periode [\d:\- ]+WI[BTA]/)?.[0],
        });
      }
    } else {
      out.errors.push(`PVMBG relatórios: ${laporanResult.reason?.message || laporanResult.reason}`);
    }

    if (!Object.keys(out.levels).length) out.errors.push('PVMBG: nenhum nível de atividade foi identificado.');
    if (!out.items.length && laporanResult.status === 'fulfilled') out.errors.push('PVMBG: nenhum relatório diário foi associado ao catálogo GVP.');
    out.ok = Object.keys(out.levels).length > 0 || out.items.length > 0;
    return out;
  });
}

export async function getUsgsStatus() {
  return cachedFetch('usgs-status', TTL_VOLCANO_ALERTS, async () => {
    // Apenas status: resposta rápida usada pela barra superior e classificação do mapa.
    const [monitoredResult, elevatedResult] = await Promise.allSettled([
      fetchJSONWithTimeout('https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes', { headers: { 'User-Agent': UA, Accept: 'application/json' } }, SOURCE_TIMEOUT.usgs),
      fetchJSONWithTimeout('https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes', { headers: { 'User-Agent': UA, Accept: 'application/json' } }, SOURCE_TIMEOUT.usgs),
    ]);
    const monitored = monitoredResult.status === 'fulfilled' ? (monitoredResult.value ?? []) : [];
    const elevated = elevatedResult.status === 'fulfilled' ? (elevatedResult.value ?? []) : [];
    if (monitoredResult.status === 'rejected' && elevatedResult.status === 'rejected') {
      throw new Error(`USGS HANS: ${monitoredResult.reason?.message || monitoredResult.reason}; ${elevatedResult.reason?.message || elevatedResult.reason}`);
    }
    const levels = {};
    for (const v of [...monitored, ...elevated]) {
      const vn = Number(v?.vnum);
      if (!vn || !v?.alert_level) continue;
      if (!levels[v.volcano_name]) levels[v.volcano_name] = { vn, level: v.alert_level, color: v.color_code, sent: v.sent_utc };
    }
    const errors = [];
    if (monitoredResult.status === 'rejected') errors.push(`Lista de monitorados: ${monitoredResult.reason?.message || monitoredResult.reason}`);
    if (elevatedResult.status === 'rejected') errors.push(`Alertas elevados: ${elevatedResult.reason?.message || elevatedResult.reason}`);
    return { ok: true, levels, elevated: elevated.slice(0, 2), items: [], errors };
  });
}

export async function getUsgs() {
  return cachedFetch('usgs-reports', TTL_OBS, async () => {
    // Reutiliza a resposta de status já cacheada; só consulta detalhes para os dois avisos
    // elevados mais recentes, pois são enriquecimento e não devem atrasar o mapa.
    const status = await getUsgsStatus();
    const base = status.body || {};
    const out = { ok: !!base.ok, stale: !!status.stale || !!base.stale, levels: base.levels || {}, items: [], errors: [...(base.errors || [])] };
    const detailList = base.elevated || [];
    await mapLimit(detailList, 2, async (v) => {
      const vn = Number(v.vnum);
      if (!vn) return;
      const j = await fetchJSONWithTimeout(`https://volcanoes.usgs.gov/hans-public/api/volcano/newestForVolcano/${vn}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, SOURCE_TIMEOUT.bulletin);
      const text = stripTags(String(j.noticeHtml || ''));
      const sent = j.sentUtc || v.sent_utc;
      let volcano = null;
      try { volcano = await matchVolcano(`${v.volcano_name} united states volcano`); } catch { /* alerta oficial permanece no painel mesmo sem vínculo GVP */ }
      if (!volcano) return;
      const ip = interpret(text);
      // WATCH/WARNING ou código vermelho não provam que a erupção esteja em andamento.
      if (isEruptiveText(text) && !ip.cats.includes('ERUPCAO')) ip.cats.unshift('ERUPCAO');
      out.items.push({
        id: `usgs-${j.noticeId || vn}-${String(sent).slice(0, 10)}`, ts: Date.parse(String(sent).replace(' ', 'T') + 'Z') || Date.now(),
        date: sent, source: 'USGS', kind: 'OFICIAL', verified: 'CONFIRMADO', title: j.noticeTitle || `${v.volcano_name} update`,
        url: j.noticeUrl || 'https://volcanoes.usgs.gov/', volcanoVn: volcano.vn, volcanoName: volcano.name, country: volcano.country,
        text: text.slice(0, 500), cats: ip.cats, ashKm: ip.ashKm, period: `${v.alert_level} ${v.color_code}`,
      });
    }).then((results) => {
      results.forEach((result, index) => { if (result?.__error) out.errors.push(`${detailList[index]?.volcano_name || 'HANS'}: ${result.__error.message || result.__error}`); });
    });
    return out;
  });
}

/** Veículos sem verificação editorial conhecida → NÃO CONFIRMADO. */
const SOCIAL_SRC = /facebook|blogspot|blog|youtube|reddit|twitter|x\.com/i;

export async function getNews() {
  return cachedFetch('news', TTL_OBS, async () => {
    const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const googleTask = mapLimit(GNEWS_QS, 3, async (q) => {
      const xml = await getHTML(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2d')}&hl=en-US&gl=US&ceid=US:en`, SOURCE_TIMEOUT.news);
      const rows = [];
      for (const it of xml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
        const titleRaw = /<title>([\s\S]*?)<\/title>/i.exec(it[0])?.[1];
        const date = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(it[0])?.[1];
        const link = /<link>([\s\S]*?)<\/link>/i.exec(it[0])?.[1];
        const srcRaw = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(it[0])?.[1] || 'Google News';
        if (!titleRaw || !date || !link) continue;
        const title = decodeEntities(titleRaw.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
        const source = decodeEntities(srcRaw.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
        const url = decodeEntities(link.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
        const key = norm(title.replace(/\s+[-–—]\s+[^-]{2,40}$/, '')).slice(0, 60);
        const mm = date.match(/,\s*(\d{1,2})\s+(\w{3})\s+(\d{4})/);
        const iso = mm ? `${mm[3]}-${MONTHS[mm[2]] || '01'}-${String(mm[1]).padStart(2, '0')}` : null;
        const vols = await matchVolcanoes(title).catch(() => []);
        const ip = interpret(title);
        const base = { ts: Date.parse(date) || Date.now(), date: iso || date, source, kind: 'NOTICIA', verified: SOCIAL_SRC.test(source) ? 'NAO_CONFIRMADO' : 'REPORTADO', title, url, text: title, cats: ip.cats, ashKm: ip.ashKm };
        if (vols.length) for (const vol of vols) rows.push({ ...base, id: `news-${key}-${vol.vn}`, volcanoVn: vol.vn, volcanoName: vol.name, country: vol.country });
        else rows.push({ ...base, id: `news-${key}`, volcanoVn: null, volcanoName: null, country: null });
      }
      return rows;
    });
    const nasaTask = (async () => {
      const xml = await getHTML('https://earthobservatory.nasa.gov/feeds/natural-hazards.rss', SOURCE_TIMEOUT.news);
      const rows = [];
      for (const it of xml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
        const titleRaw = /<title>([\s\S]*?)<\/title>/i.exec(it[0])?.[1];
        if (!titleRaw) continue;
        const title = decodeEntities(titleRaw.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
        if (!/volcan/i.test(title)) continue;
        const date = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(it[0])?.[1];
        const link = /<link>([\s\S]*?)<\/link>/i.exec(it[0])?.[1];
        const desc = stripTags(/<description>[\s\S]*?<\/description>/i.exec(it[0])?.[0] || '');
        const volcano = await matchVolcano(title + ' ' + desc.slice(0, 200)).catch(() => null);
        const ip = interpret(title + ' ' + desc);
        rows.push({ id: `eo-${norm(title)}`, ts: Date.parse(date || '') || Date.now(), date: date?.slice(0, 16) || null, source: 'NASA Earth Observatory', kind: 'NOTICIA', verified: 'REPORTADO', title, url: decodeEntities(link || 'https://earthobservatory.nasa.gov/'), volcanoVn: volcano?.vn ?? null, volcanoName: volcano?.name ?? null, country: volcano?.country ?? null, text: desc.slice(0, 400), cats: ip.cats, ashKm: ip.ashKm });
      }
      return rows;
    })();

    const [queryResults, nasaResult] = await Promise.all([googleTask, Promise.allSettled([nasaTask])]);
    const items = [];
    const seen = new Set();
    const errors = [];
    let successfulQueries = 0;
    for (const result of queryResults) {
      if (result?.__error) { errors.push(`Google News: ${result.__error.message || result.__error}`); continue; }
      successfulQueries++;
      for (const item of result || []) if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
    }
    const nasaStatus = nasaResult[0];
    let nasaOk = nasaStatus.status === 'fulfilled';
    if (nasaOk) {
      for (const item of nasaStatus.value || []) if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
    } else errors.push(`NASA Earth Observatory: ${nasaStatus.reason?.message || nasaStatus.reason}`);

    const googleOk = successfulQueries > 0;
    return { ok: googleOk || nasaOk, items, errors, sourceStatus: {
      gnews: { ok: googleOk, errors: errors.filter((e) => e.startsWith('Google News:')) },
      eo: { ok: nasaOk, errors: errors.filter((e) => e.startsWith('NASA Earth Observatory:')) },
    } };
  });
}

/* ============================ Smithsonian GVP: relatórios completos ============================ */
const GVP_WEEKLY_PAGE = 'https://volcano.si.edu/reports_weekly.cfm?vtab=feeds';
const GVP_WEEKLY_RSS = 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml';
const GVP_DAILY_PAGE = 'https://volcano.si.edu/reports_daily.cfm';
const GVP_BULLETIN_PAGE = 'https://volcano.si.edu/reports_bgvn.cfm';

let gvpBlockedUntil = 0;
let gvpBlockedReason = '';
function markGvpBlocked(error) {
  const message = String(error?.message || error);
  if (/HTTP 403|forbidden/i.test(message)) {
    gvpBlockedUntil = Date.now() + GVP_BLOCK_BACKOFF;
    gvpBlockedReason = message;
  } else if (/timeout|HTTP 429|HTTP 5\d\d|ECONNRESET|ECONNREFUSED|fetch failed/i.test(message)) {
    gvpBlockedUntil = Date.now() + GVP_TRANSIENT_BACKOFF;
    gvpBlockedReason = message;
  }
}
function gvpIsBlocked() { return Date.now() < gvpBlockedUntil; }
async function getGvpHTML(url, allowProbe = false) {
  if (gvpIsBlocked() && !allowProbe) throw new Error(`Smithsonian GVP temporariamente em pausa (${gvpBlockedReason}); nova tentativa após ${new Date(gvpBlockedUntil).toLocaleTimeString('pt-BR')}.`);
  try {
    const html = await getHTML(url, SOURCE_TIMEOUT.gvp, { Referer: 'https://volcano.si.edu/', 'Sec-Fetch-Site': 'same-origin' });
    gvpBlockedUntil = 0;
    gvpBlockedReason = '';
    return html;
  } catch (error) {
    markGvpBlocked(error);
    throw error;
  }
}

function gvpReportDate(period, fallback = '') {
  const raw = String(period || '').trim();
  // Weekly GVP usually writes ranges such as "November 5-11, 2026".
  const range = raw.match(/^([A-Za-z]+)\s+\d{1,2}\s*[-–]\s*(\d{1,2}),?\s*(\d{4})$/);
  const rangeEnd = range ? `${range[1]} ${range[2]} ${range[3]}` : '';
  const end = raw.match(/-\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
  const date = rangeEnd || end?.[1] || raw || fallback;
  const parsed = Date.parse(date);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackTs = Date.parse(fallback);
  return Number.isFinite(fallbackTs) ? fallbackTs : Date.now();
}

function gvpCategories(text, reportType = '') {
  const result = interpret(text);
  const type = String(reportType || '');
  if (/continuing\s+(?:eruptive\s+activity|eruption)/i.test(type)) {
    if (!result.cats.includes('ERUPCAO')) result.cats.unshift('ERUPCAO');
  } else if (/new\s+(?:eruptive\s+activity|eruption)/i.test(type)) {
    if (!result.cats.includes('ERUPCAO_RECENTE')) result.cats.unshift('ERUPCAO_RECENTE');
  } else if (/(?:new|continuing)\s+unrest/i.test(type)) {
    if (!result.cats.includes('INQUIETACAO')) result.cats.push('INQUIETACAO');
  }
  return result;
}

/** Extrai cada bloco de relatório completo das seções HTML do GVP. */
async function parseGvpHtmlReports(html, source, pageUrl, fallbackDate = '') {
  const headings = [...String(html || '').matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)];
  const items = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const heading = cleanHtml(h[2]).replace(/\s+/g, ' ').trim();
    const parts = heading.split('|').map((x) => x.trim());
    const nameCountry = parts[0]?.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (!nameCountry) continue;
    const name = nameCountry[1].trim();
    const country = nameCountry[2].trim();
    const period = parts.length >= 3 ? parts[1] : (fallbackDate || '');
    const reportType = parts.length >= 3 ? parts.slice(2).join(' | ').replace(/\s*Cite this Report\s*$/i, '').trim() : (parts[1] || '');
    const currentLevel = Number(h[1]);
    let end = String(html).length;
    for (let j = i + 1; j < headings.length; j++) {
      if (Number(headings[j][1]) <= currentLevel) { end = headings[j].index; break; }
    }
    const afterHeading = (h.index ?? 0) + h[0].length;
    const block = String(html).slice(afterHeading, end);
    const text = cleanHtml(block).replace(/\bCite this Report\b/gi, '').trim();
    if (text.length < 45) continue;

    const volcano = await matchVolcano(`${name} ${country} ${text.slice(0, 500)}`);
    if (!volcano) continue;
    const report = gvpCategories(text, reportType);
    const dateTs = gvpReportDate(period, fallbackDate);
    const linkMatch = block.match(/href=["']([^"']*(?:showreport|volcano\.cfm|bulletin)[^"']*)["']/i);
    const url = linkMatch ? new URL(linkMatch[1].replace(/&amp;/g, '&'), pageUrl).toString() : pageUrl;
    const titleSuffix = reportType || 'Atividade vulcânica';
    items.push({
      id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${volcano.vn}-${norm(period || fallbackDate || heading).slice(0, 48)}`, 
      ts: dateTs,
      date: period || fallbackDate || new Date(dateTs).toISOString().slice(0, 10),
      source,
      kind: 'OFICIAL',
      verified: 'CONFIRMADO',
      title: `${name} (${country}) — ${titleSuffix}`,
      url,
      volcanoVn: volcano.vn,
      volcanoName: volcano.name,
      country: volcano.country,
      text: text.slice(0, 12_000),
      cats: report.cats,
      ashKm: report.ashKm,
      period: period || undefined,
    });
  }
  return items;
}

function xmlValue(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  const value = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
  return decodeEntities(value.trim());
}

async function parseGvpRss(xml, fallbackUrl = GVP_WEEKLY_PAGE) {
  const items = [];
  for (const match of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const node = match[1];
    const title = xmlValue(node, 'title');
    const description = xmlValue(node, 'description');
    const link = xmlValue(node, 'link') || fallbackUrl;
    const pubDate = xmlValue(node, 'pubDate');
    const text = cleanHtml(description || title);
    if (text.length < 45) continue;
    const volcano = await matchVolcano(`${title} ${text.slice(0, 1800)}`);
    if (!volcano) continue;
    const type = (title + ' ' + text.slice(0, 350)).match(/(?:New|Continuing)\s+(?:Unrest|Eruptive Activity)|Continuing eruption|New eruption/i)?.[0] || '';
    const report = gvpCategories(text, type);
    const ts = Date.parse(pubDate) || Date.now();
    items.push({
      id: `gvp-rss-${volcano.vn}-${ts}`,
      ts,
      date: pubDate || new Date(ts).toISOString().slice(0, 10),
      source: 'Smithsonian GVP Weekly RSS',
      kind: 'OFICIAL',
      verified: 'CONFIRMADO',
      title: title || `${volcano.name} — Weekly Volcanic Activity Report`,
      url: link,
      volcanoVn: volcano.vn,
      volcanoName: volcano.name,
      country: volcano.country,
      text: text.slice(0, 12_000),
      cats: report.cats,
      ashKm: report.ashKm,
      period: undefined,
    });
  }
  return items;
}

export async function getGvpWeekly() {
  return cachedFetch('gvp-weekly-full', TTL_OBS, async () => {
    const errors = [];
    let items = [];
    // O RSS é mais leve e contém as narrativas resumidas oficiais. Só consulta HTML
    // quando o feed está indisponível por motivo diferente de HTTP 403.
    try {
      const rss = await getGvpHTML(GVP_WEEKLY_RSS);
      items = await parseGvpRss(rss);
    } catch (error) {
      errors.push(`RSS semanal: ${error.message || error}`);
      if (/HTTP 403|em pausa por HTTP 403/i.test(String(error.message || error))) {
        return { ok: false, items: [], errors, blocked: true };
      }
      try {
        const html = await getGvpHTML(GVP_WEEKLY_PAGE, true);
        items = await parseGvpHtmlReports(html, 'Smithsonian GVP Weekly Report', GVP_WEEKLY_PAGE);
      } catch (htmlError) { errors.push(`Relatório semanal HTML: ${htmlError.message || htmlError}`); }
    }
    return { ok: items.length > 0, items, errors };
  }, GVP_BLOCK_BACKOFF);
}

export async function getGvpDaily() {
  return cachedFetch('gvp-daily-full', TTL_OBS, async () => {
    if (gvpIsBlocked()) return { ok: false, items: [], errors: [`Consulta suspensa após ${gvpBlockedReason}; usando as demais fontes oficiais enquanto o GVP bloqueia o acesso.`], blocked: true };
    const date = new Date().toISOString().slice(0, 10);
    const url = `${GVP_DAILY_PAGE}?activitydate=${date}&vtab=reports`;
    try {
      const html = await getGvpHTML(url);
      const items = await parseGvpHtmlReports(html, 'Smithsonian GVP Daily Report', url, date);
      return { ok: items.length > 0, items, errors: items.length ? [] : ['Nenhum bloco diário de atividade foi reconhecido na página consultada.'] };
    } catch (error) { return { ok: false, items: [], errors: [String(error.message || error)], blocked: gvpIsBlocked() }; }
  }, GVP_BLOCK_BACKOFF);
}

/**
 * O BGVN usa uma estrutura diferente da página semanal: cada boletim começa
 * em um h5 e contém h3/h4 internos (nome, país, coordenadas e título do artigo).
 * Por isso, o bloco termina no próximo h5 de artigo, não no próximo h3/h4.
 */
async function parseGvpBulletinReports(html, source, pageUrl) {
  const headings = [...String(html || '').matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5\s*>/gi)];
  const articles = headings.map((h, index) => {
    const heading = cleanHtml(h[1]).replace(/\s+/g, ' ').trim();
    const match = heading.match(/^(.+?)\s*\(([^)]+)\)\s*[—–-]\s*(.+)$/);
    return match ? { h, index, name: match[1].trim(), country: match[2].trim(), period: match[3].trim(), heading } : null;
  }).filter(Boolean);
  const items = [];

  for (const article of articles) {
    const { h, index, name, country, period, heading } = article;
    const nextArticle = articles.find((candidate) => candidate.index > index);
    const end = nextArticle?.h.index ?? String(html).length;
    const start = (h.index ?? 0) + h[0].length;
    const block = String(html).slice(start, end);
    const fullText = cleanHtml(block).replace(/\bCite this Report\b/gi, '').trim();
    if (fullText.length < 80) continue;

    const reportText = fullText.split(/\bGeological Summary\b/i)[0].trim();
    const volcano = await matchVolcano(`${name} ${country} ${reportText.slice(0, 700)}`);
    if (!volcano) continue;

    const h4BeforeNarrative = [...block.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4\s*>/gi)]
      .map((m) => cleanHtml(m[1]).replace(/\s+/g, ' ').trim())
      .filter((value) => value && !/^(?:all times|\d|[A-Z][a-z]+)$/i.test(value));
    const reportTitle = h4BeforeNarrative.find((value) => /during|activity|emissions|explosions|plumes|flows|eruption|ash|incandescence|seismicity/i.test(value));
    const report = interpret(reportText);
    const dateTs = gvpReportDate(period);

    items.push({
      id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${volcano.vn}-${norm(period || heading).slice(0, 48)}`,
      ts: dateTs,
      date: period,
      source,
      kind: 'OFICIAL',
      verified: 'CONFIRMADO',
      title: `${name} (${country}) — ${reportTitle || period}`,
      url: pageUrl,
      volcanoVn: volcano.vn,
      volcanoName: volcano.name,
      country: volcano.country,
      text: fullText.slice(0, 12_000),
      cats: report.cats,
      ashKm: report.ashKm,
      period,
    });
  }
  return items;
}

export async function getGvpBulletins() {
  return cachedFetch('gvp-bulletins-full', TTL_CAT, async () => {
    if (gvpIsBlocked()) return { ok: false, items: [], errors: [`Consulta suspensa após ${gvpBlockedReason}; o endpoint de boletins está temporariamente inacessível a este servidor.`], blocked: true };
    try {
      const html = await getGvpHTML(GVP_BULLETIN_PAGE);
      const items = await parseGvpBulletinReports(html, 'Smithsonian GVP Bulletin', GVP_BULLETIN_PAGE);
      return { ok: items.length > 0, items, errors: items.length ? [] : ['A página foi acessada, mas nenhum boletim individual foi reconhecido.'] };
    } catch (error) { return { ok: false, items: [], errors: [String(error.message || error)], blocked: gvpIsBlocked() }; }
  }, GVP_BLOCK_BACKOFF);
}

/* ============================ Persistência + agregação ============================ */
const SEED_DATA_FILE = join(__dirname, 'data', 'reports.json');
// Vercel Functions têm sistema de arquivos de execução somente leitura, exceto /tmp.
// Usa o JSON embarcado como semente e /tmp para alterações durante a vida da instância.
const DATA_FILE = process.env.VERCEL ? '/tmp/geogus-reports.json' : SEED_DATA_FILE;
function loadStore() {
  try {
    const file = existsSync(DATA_FILE) ? DATA_FILE : SEED_DATA_FILE;
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { items: [], lastStamp: null };
  } catch { return { items: [], lastStamp: null }; }
}
function saveStore(store) {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(store));
  } catch { /* Vercel pode reciclar /tmp; histórico durável exige armazenamento externo. */ }
}

let agg = null; // { t, out }
let reportPromise = null;
export async function getReports(force = false) {
  if (!force && agg && Date.now() - agg.t < TTL_REPORTS) return agg.out;
  if (reportPromise) return reportPromise;

  reportPromise = (async () => {
    const [ph, pv, us, news] = await Promise.allSettled([getPhivolcs(), getPvmbg(), getUsgs(), getNews()]);
    const get = (r) => {
      if (r?.status === 'rejected') return { ok: false, items: [], errors: [String(r.reason?.message ?? r.reason)] };
      const value = r?.status === 'fulfilled' ? r.value : r;
      const body = value?.body ?? value ?? {};
      return { ...body, stale: !!(value?.stale || body?.stale), updatedAt: value?.updatedAt ?? body?.updatedAt, cacheAgeMs: value?.cacheAgeMs ?? body?.cacheAgeMs };
    };
    const phv = get(ph), pvg = get(pv), usg = get(us), nws = get(news);

    // O GVP é consultado primeiro pelo feed semanal. Se o host devolver 403, o
    // disjuntor evita repetir a mesma falha nos endpoints diário e BGVN nesta rodada.
    let gvpW = { ok: false, items: [], errors: [] };
    let gvpD = { ok: false, items: [], errors: [] };
    let gvpB = { ok: false, items: [], errors: [] };
    let gvpWResult = null; let gvpDResult = null; let gvpBResult = null;
    try {
      const result = await getGvpWeekly();
      gvpWResult = result;
      gvpW = get(result);
    } catch (error) { gvpW.errors = [String(error.message || error)]; }
    if (gvpIsBlocked()) {
      const blockedMessage = `Consulta do Smithsonian pausada temporariamente (${gvpBlockedReason}); as demais fontes continuam sendo consultadas.`;
      gvpD.errors = [blockedMessage];
      gvpB.errors = [blockedMessage];
    } else {
      const [dailyResult, bulletinResult] = await Promise.allSettled([getGvpDaily(), getGvpBulletins()]);
      gvpDResult = dailyResult.status === 'fulfilled' ? dailyResult.value : null;
      gvpBResult = bulletinResult.status === 'fulfilled' ? bulletinResult.value : null;
      gvpD = get(dailyResult);
      gvpB = get(bulletinResult);
    }

    const fresh = [...(phv.items || []), ...(pvg.items || []), ...(usg.items || []), ...(nws.items || []), ...(gvpW.items || []), ...(gvpD.items || []), ...(gvpB.items || [])].filter((x) => !x.error);
    const store = loadStore();
    for (const it of store.items) {
      if (it.kind === 'NOTICIA') {
        const ip = interpret(String(it.title));
        it.cats = ip.cats;
        if (ip.ashKm) it.ashKm = ip.ashKm;
        it.verified = SOCIAL_SRC.test(String(it.source || '')) ? 'NAO_CONFIRMADO' : 'REPORTADO';
      } else if (it.source === 'USGS') {
        const eruptive = isEruptiveText(String(it.text || '')); // alertas altos não são confirmação de erupção
        it.cats = (it.cats || []).filter((c) => c !== 'ERUPCAO');
        if (eruptive) it.cats.unshift('ERUPCAO');
      }
    }
    // Repara atribuições antigas feitas por nomes ambíguos do catálogo (ex.: "Morning").
    if (store.items.some((i) => i.kind === 'NOTICIA' && i.volcanoName && AMBIGUOUS.has(String(i.volcanoName).toLowerCase()))) {
      for (const it of store.items) {
        if (it.kind !== 'NOTICIA' || !it.volcanoName || !AMBIGUOUS.has(String(it.volcanoName).toLowerCase())) continue;
        const vols = await matchVolcanoes(it.title).catch(() => []);
        const v = vols[0];
        it.volcanoVn = v?.vn ?? null; it.volcanoName = v?.name ?? null; it.country = v?.country ?? null;
        if (v) it.id = `news-${norm(it.title).slice(0, 60)}-${v.vn}`;
      }
      const seenIds = new Set();
      store.items = store.items.filter((i) => (seenIds.has(i.id) ? false : (seenIds.add(i.id), true)));
      saveStore(store);
    }
    const seen = new Set(store.items.map((i) => i.id));
    let added = 0;
    for (const it of fresh) if (!seen.has(it.id)) { store.items.push(it); seen.add(it.id); added++; }
    store.items.sort((a, b) => b.ts - a.ts);
    if (store.items.length > 3000) store.items.length = 3000;
    if (added || !store.lastStamp) { store.lastStamp = new Date().toISOString(); saveStore(store); }

    const winRaw = store.items.filter((i) => Date.now() - i.ts < 48 * 3600e3);
    const updatesRaw = store.items.filter((i) => Date.now() - i.ts < 7 * 24 * 3600e3 || /GVP Bulletin/i.test(String(i.source || '')));
    const newsKey = (i) => `${i.volcanoVn ?? 'x'}|${norm(String(i.title).replace(/\s+[-–—]\s+[^-]{2,40}$/, '')).slice(0, 80)}`;
    const dedupeNews = (list) => {
      const seenNews = new Set();
      return list.filter((i) => {
        if (i.kind !== 'NOTICIA') return true;
        const key = newsKey(i);
        if (seenNews.has(key)) return false;
        seenNews.add(key);
        return true;
      });
    };
    const win = dedupeNews(winRaw);
    const updateItems = dedupeNews(updatesRaw);
    const sourceOf = (id, label, value, updatedAt) => ({ id, label, ok: !!value.ok, stale: !!value.stale, stamp: updatedAt || Date.now(), errors: value.errors || [] });
    const gnewsStatus = nws.sourceStatus?.gnews || { ok: !!nws.ok, errors: nws.errors || [] };
    const nasaStatus = nws.sourceStatus?.eo || { ok: false, errors: [] };
    const sources = [
      sourceOf('phivolcs', 'PHIVOLCS', phv, phv.updatedAt),
      sourceOf('pvmbg', 'PVMBG', pvg, pvg.updatedAt),
      sourceOf('usgs', 'USGS HANS', usg, usg.updatedAt),
      { id: 'gnews', label: 'Notícias (Google News: Reuters/AP/etc.)', ok: !!gnewsStatus.ok, stale: !!nws.stale, stamp: nws.updatedAt || Date.now(), errors: gnewsStatus.errors || [] },
      { id: 'eo', label: 'NASA Earth Observatory', ok: !!nasaStatus.ok, stale: !!nws.stale, stamp: nws.updatedAt || Date.now(), errors: nasaStatus.errors || [] },
      sourceOf('gvp-weekly', 'Smithsonian GVP — Relatório semanal completo / RSS', gvpW, (gvpWResult?.updatedAt)),
      sourceOf('gvp-daily', 'Smithsonian GVP — Relatório diário', gvpD, (gvpDResult?.updatedAt)),
      sourceOf('gvp-bulletin', 'Smithsonian GVP — Recent Bulletin Reports', gvpB, (gvpBResult?.updatedAt)),
    ];
    const erupting = [...new Set(win.filter((i) => i.kind === 'OFICIAL' && i.cats.includes('ERUPCAO')).map((i) => i.volcanoName).filter(Boolean))];
    const byCat = {};
    for (const c of ['EXPLOSIVA', 'CINZAS', 'STROMBOLIANA', 'LAVA', 'PIROCLASTICO', 'LAHAR', 'GASES', 'SISMICIDADE', 'INQUIETACAO']) {
      const names = [...new Set(win.filter((i) => i.cats.includes(c)).map((i) => i.volcanoName).filter(Boolean))];
      if (names.length) byCat[c] = names;
    }
    const ash = win.filter((i) => i.ashKm && i.volcanoName).map((i) => `${i.volcanoName}: coluna ~${i.ashKm.toFixed(1)} km`);
    const out = {
      ok: true, stamp: new Date().toISOString(), total: store.items.length, window48: win.length, added,
      erupting, byCat, ash, panorama: await buildPanorama(win, { erupting, byCat, ash, sources }),
      sources, items: updateItems.slice(0, 250),
    };
    agg = { t: Date.now(), out };
    return out;
  })();
  try { return await reportPromise; }
  finally { reportPromise = null; }
}

/* ============================ Panorama: janela de 48 h; atualizações exibem até 7 dias ============================ */
async function buildPanorama(win, { erupting, byCat, ash, sources }) {
  const now = new Date();
  const base = {
    gerado: now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    oficials: win.filter((i) => i.kind === 'OFICIAL').length,
    noticias: win.filter((i) => i.kind === 'NOTICIA').length,
    erupting, byCat, ash,
  };
  // Se todas as fontes falharam ou só há cache antigo, ausência de registros não significa ausência de atividade.
  const freshSources = sources.filter((source) => source.ok && !source.stale);
  if (!freshSources.length) {
    const cachedSources = sources.filter((source) => source.ok && source.stale);
    const text = cachedSources.length
      ? `Não foi possível atualizar as fontes agora. Existem dados anteriores em cache de ${cachedSources.map((s) => s.label).join(', ')}, mas eles não devem ser interpretados como confirmação da atividade nas últimas 48 horas.`
      : `Não foi possível confirmar a atividade vulcânica nas últimas 48 horas porque nenhuma das fontes consultadas respondeu com dados atuais. Isso não significa que não exista atividade.`;
    return { ai: false, ...base, text };
  }
  // IA opcional (endpoint OpenAI-compatible via env). Sem config → texto determinístico.
  const { AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (AI_API_URL && AI_API_KEY) {
    try {
      const facts = JSON.stringify({
        gerado: base.gerado,
        janela_horas: 48,
        erupcoes_confirmadas: erupting,
        atividade_por_categoria: byCat,
        colunas_de_cinzas_km: ash,
        amostra_relatorios: win.filter((i) => i.kind === 'OFICIAL').slice(0, 25).map((i) => ({ vulcao: i.volcanoName, pais: i.country, data: i.date, texto: i.text.slice(0, 700) })),
      });
      const j = await fetchJSONWithTimeout(`${AI_API_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Você é analista vulcanológico. Escreva um panorama mundial em português do Brasil (1 parágrafo) usando EXCLUSIVAMENTE os dados JSON fornecidos. Não invente vulcões, números, datas ou eventos. Diferencie erupção contínua, episódio isolado e inquietação. Cite apenas vulcões presentes nos dados.' },
            { role: 'user', content: facts },
          ],
          temperature: 0.2,
        }),
      }, SOURCE_TIMEOUT.ai);
      const txt = j?.choices?.[0]?.message?.content;
      if (txt) return { ai: true, ...base, text: String(txt).trim() };
    } catch { /* cai no determinístico */ }
  }
  const fmt = (arr) => arr?.length ? arr.join(', ') : null;
  const parts = [];
  parts.push(`Erupções confirmadas em boletins oficiais nas últimas 48 horas: ${erupting.length ? erupting.join(', ') + '.' : 'nenhuma até o momento.'}`);
  if (byCat.EXPLOSIVA) parts.push(`Foram registrados episódios explosivos envolvendo: ${fmt(byCat.EXPLOSIVA)}.`);
  if (byCat.CINZAS) parts.push(`Emissões de cinzas: ${fmt(byCat.CINZAS)}.`);
  if (byCat.STROMBOLIANA) parts.push(`Atividade stromboliana: ${fmt(byCat.STROMBOLIANA)}.`);
  if (byCat.LAVA) parts.push(`Lava/extrusão: ${fmt(byCat.LAVA)}.`);
  if (byCat.PIROCLASTICO) parts.push(`Fluxos piroclásticos: ${fmt(byCat.PIROCLASTICO)}.`);
  if (ash.length) parts.push(`Colunas de cinzas medidas: ${ash.join('; ')}.`);
  const unrest = byCat.INQUIETACAO?.filter((n) => !erupting.includes(n));
  if (unrest?.length) parts.push(`Também em inquietação vulcânica: ${fmt(unrest)}.`);
  if (byCat.SISMICIDADE) parts.push(`Sismicidade vulcânica destacada em: ${fmt(byCat.SISMICIDADE)}.`);
  parts.push(`Fontes analisadas: ${sources.filter((s) => s.ok).map((s) => s.label).join('; ')} (${base.oficials} relatórios oficiais e ${base.noticias} notícias em 48 h).`);
  return { ai: false, ...base, text: parts.join(' ') };
}

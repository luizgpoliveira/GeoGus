const FEEDS = [
  { id: 'PTWC', label: 'Pacific Tsunami Warning Center (NOAA)', url: 'https://www.tsunami.gov/events/xml/PHEBCAP.xml', scope: 'Havaí, territórios dos EUA no Pacífico e Caribe; centro regional do Pacífico/Caribe' },
  { id: 'NTWC', label: 'National Tsunami Warning Center (NOAA)', url: 'https://www.tsunami.gov/events/xml/PAAQCAP.xml', scope: 'Estados Unidos continentais, Alasca e Canadá' },
];

const TTL = 60_000;
const TIMEOUT = 8_000;
let cache = null;
let inflight = null;

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(xml).match(new RegExp(`<(?:(?:[\\w.-]+):)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${safe}\\s*>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseCap(xml, feed) {
  const alertXml = String(xml).match(/<(?:[\w.-]+:)?alert(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?alert\s*>/i)?.[1] || String(xml);
  const infoXml = alertXml.match(/<(?:[\w.-]+:)?info(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?info\s*>/i)?.[1] || alertXml;
  const identifier = tag(alertXml, 'identifier');
  const sent = tag(alertXml, 'sent');
  const status = tag(alertXml, 'status');
  const msgType = tag(alertXml, 'msgType');
  const scope = tag(alertXml, 'scope');
  const event = tag(infoXml, 'event');
  const headline = tag(infoXml, 'headline');
  const description = tag(infoXml, 'description');
  const instruction = tag(infoXml, 'instruction');
  const area = tag(infoXml, 'areaDesc');
  const urgency = tag(infoXml, 'urgency');
  const severity = tag(infoXml, 'severity');
  const certainty = tag(infoXml, 'certainty');
  const effective = tag(infoXml, 'effective') || sent;
  const expires = tag(infoXml, 'expires');
  const eventText = `${event} ${headline}`;
  if (!identifier || !/tsunami/i.test(eventText) || !/^Actual$/i.test(status) || !/^Public$/i.test(scope)) return null;
  if (/^Cancel$/i.test(msgType)) return null;
  const expiresAt = expires ? Date.parse(expires) : null;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;

  const level = /warning/i.test(eventText) ? 'WARNING'
    : /watch/i.test(eventText) ? 'WATCH'
      : /advisory/i.test(eventText) ? 'ADVISORY' : 'INFORMATION';
  const actionable = level !== 'INFORMATION' && !/past|immediate/i.test(urgency) ? true
    : level !== 'INFORMATION' && /immediate|expected/i.test(urgency);
  return {
    id: identifier,
    source: feed.id,
    sourceLabel: feed.label,
    scope: feed.scope,
    title: headline || event || 'Mensagem de tsunami',
    body: [description, instruction].filter(Boolean).join(' '),
    area: area || 'Área não especificada no boletim',
    event: event || 'Tsunami',
    level,
    urgency: urgency || 'Unknown',
    severity: severity || 'Unknown',
    certainty: certainty || 'Unknown',
    status,
    msgType,
    sent: sent || effective || new Date().toISOString(),
    expires: expires || null,
    actionable,
    url: feed.url,
  };
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(feed.url, {
      headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.5', 'User-Agent': 'GeoGus/1.0 (public hazard information app)' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.status === 204) return { id: feed.id, label: feed.label, ok: true, count: 0, alerts: [], updatedAt: Date.now() };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    if (!/<(?:[\w.-]+:)?alert\b/i.test(xml)) throw new Error('Resposta CAP/XML não reconhecida');
    const item = parseCap(xml, feed);
    return { id: feed.id, label: feed.label, ok: true, count: item ? 1 : 0, alerts: item ? [item] : [], updatedAt: Date.now() };
  } catch (error) {
    const message = controller.signal.aborted ? `Timeout após ${TIMEOUT / 1000}s` : String(error?.message || error);
    return { id: feed.id, label: feed.label, ok: false, count: 0, alerts: [], error: message, updatedAt: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function getTsunamiAlerts(force = false) {
  if (!force && cache && Date.now() - cache.cachedAt < TTL) {
    return { ...cache.payload, stale: false, cacheAgeMs: Date.now() - cache.cachedAt };
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const sources = await Promise.all(FEEDS.map(fetchFeed));
    const errors = sources.filter((source) => !source.ok).map((source) => `${source.id}: ${source.error}`);
    const alerts = sources.flatMap((source) => source.alerts);
    const payload = {
      ok: sources.some((source) => source.ok),
      stamp: new Date().toISOString(),
      alerts,
      total: alerts.length,
      sources: sources.map(({ alerts: _alerts, ...source }) => source),
      errors,
      coverage: 'NOAA PTWC/NTWC; cobertura limitada às regiões atendidas por esses centros, não é um feed global único.',
    };
    if (payload.ok) {
      cache = { cachedAt: Date.now(), payload };
      return { ...payload, stale: false, cacheAgeMs: 0 };
    }
    if (cache) return { ...cache.payload, stale: true, cacheAgeMs: Date.now() - cache.cachedAt, errors };
    return { ...payload, stale: false, cacheAgeMs: 0 };
  })().finally(() => { inflight = null; });
  return inflight;
}

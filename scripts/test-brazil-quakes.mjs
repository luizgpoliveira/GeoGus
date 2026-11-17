import assert from 'node:assert/strict';
import {
  parseFdsnQuakeML,
  parseLabSisBulletin,
  parseTableBasedBrazilianEvents,
  parseUnimontesRss,
  discoverUnimontesPdfLinks,
  parseSISBRAPrelim,
  mergeEvents,
  getEarthquakeFeed,
} from '../server/earthquakes.mjs';

const now = new Date();
const y = now.getUTCFullYear();
const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
const d = String(now.getUTCDate()).padStart(2, '0');
const hh = String(now.getUTCHours()).padStart(2, '0');
const mm = String(now.getUTCMinutes()).padStart(2, '0');
const ss = String(now.getUTCSeconds()).padStart(2, '0');
const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}.000Z`;
const compactDate = `${y}${mo}${d}`;
const compactTime = `${hh}${mm}${ss}`;
const nowMs = Date.parse(iso);

function quakeML(id, lat, lon, mag = 2.1, place = 'Brasil') {
  return `<?xml version="1.0"?><q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters><event publicID="smi:local/event/${id}"><preferredOriginID>origin-${id}</preferredOriginID><preferredMagnitudeID>mag-${id}</preferredMagnitudeID><description><text>${place}</text></description><origin publicID="origin-${id}"><time><value>${iso}</value></time><latitude><value>${lat}</value></latitude><longitude><value>${lon}</value></longitude><depth><value>8500</value></depth><evaluationMode>manual</evaluationMode><evaluationStatus>confirmed</evaluationStatus></origin><magnitude publicID="mag-${id}"><mag><value>${mag}</value></mag><type>mR</type></magnitude></event></eventParameters></q:quakeml>`;
}

// USP / FDSN QuakeML parsing and review status.
const usp = parseFdsnQuakeML(quakeML('usp-unit', -16.2, -48.9), {
  minMag: 1, source: 'USP', label: 'Centro de Sismologia USP / BRASIS', brazilOnly: true,
});
assert.equal(usp.length, 1);
assert.equal(usp[0].source, 'USP');
assert.equal(usp[0].depthKm, 8.5);
assert.match(usp[0].status, /Revisado/);

// LabSis bulletin parsing: UTC clock and explicit coordinates.
const labsisHTML = `<table><tr><td>${y}.${mo}.${d}</td><td>${hh}:${mm}:${ss}</td><td>1.8*</td><td>-08.33; -35.99</td><td>PE</td><td>Caruaru</td></tr></table>`;
const labsis = parseLabSisBulletin(labsisHTML, 1, 'month');
assert.equal(labsis.length, 1);
assert.equal(labsis[0].source, 'LabSis');
assert.match(labsis[0].status, /preliminar/i);

// UnB tabular bulletin parser must preserve blank columns and require lat/lon.
const unbHTML = `<table><tr><th>Data</th><th>Hora UTC</th><th>Magnitude</th><th>Latitude</th><th>Longitude</th><th>Profundidade</th><th>Município</th><th>UF</th></tr><tr><td>${d}/${mo}/${y}</td><td>${hh}:${mm}:${ss}</td><td>2.2</td><td>-10.5</td><td>-45.2</td><td>8</td><td>Montes Claros</td><td>MG</td></tr></table>`;
const unb = parseTableBasedBrazilianEvents(unbHTML, { source: 'UnB', label: 'SIS-UnB', minMag: 1, period: 'month', url: 'https://obsis.unb.br/' });
assert.equal(unb.length, 1);
assert.equal(unb[0].source, 'UnB');
assert.match(unb[0].place, /Montes Claros, MG, Brasil/);

// Unimontes uses local time in monthly bulletins; UTC conversion adds 3h.
const unimontesHtml = `<table><tr><th>Data</th><th>Hora Local</th><th>Latitude</th><th>Longitude</th><th>Município</th><th>Magnitude</th></tr><tr><td>${d}/${mo}/${y}</td><td>10:00:00</td><td>-19.50</td><td>-44.20</td><td>Sete Lagoas</td><td>2.1</td></tr></table>`;
const unimontesRows = parseTableBasedBrazilianEvents(unimontesHtml, { source: 'Unimontes', label: 'NES/Unimontes', minMag: 1, period: 'month', utcOffsetHours: 3 });
assert.equal(unimontesRows.length, 1);
assert.equal(new Date(unimontesRows[0].time).getUTCHours(), 13);
const unimontesRss = `<rss><channel><item><title>Boletim sísmico</title><link>https://unimontes.br/boletim.pdf</link><content:encoded><![CDATA[${unimontesHtml}]]></content:encoded></item></channel></rss>`;
assert.equal(parseUnimontesRss(unimontesRss, 1, 'month').length, 1);
const links = discoverUnimontesPdfLinks('<a href="/wp-content/Boletim-Sismologico-2026.pdf">Boletim Sísmico 2026</a><a href="/x.pdf">Outro arquivo</a>');
assert.equal(links.length, 1);
assert.match(links[0].url, /Boletim-Sismologico-2026\.pdf/);

// SISBRA preliminary parser maps institutional contributor tags and filters doubtful/repeated categories.
const sisbraLine = `${y} ${mo}${d} ${compactTime} -12.0 -45.0 0 GO 8.5 2.4 ML A 3 0 Goiânia (UnB,UFRN,IAG)`;
const sisbra = parseSISBRAPrelim(sisbraLine, 1, 'month');
assert.equal(sisbra.length, 1);
assert.ok(sisbra[0].sources.includes('SIS-UnB'));
assert.ok(sisbra[0].sources.includes('UFRN / RSISNE'));
assert.ok(sisbra[0].sources.includes('USP / BRASIS'));
const doubtful = `${y} ${mo}${d} ${compactTime} -12.0 -45.0 0 GO 8.5 2.4 ML D 3 0 Goiânia (UnB)`;
assert.equal(parseSISBRAPrelim(doubtful, 1, 'month').length, 0);

// Spatial-temporal merge retains provenance and does not duplicate a single event.
const duplicateUSGS = { ...usp[0], id: 'USGS-duplicate', source: 'USGS', sources: ['USGS'], mag: 2.0, url: 'https://earthquake.usgs.gov/' };
const mergedPair = mergeEvents([[usp[0]], [duplicateUSGS]]);
assert.equal(mergedPair.length, 1);
assert.ok(mergedPair[0].sources.includes('USGS'));
assert.ok(mergedPair[0].sources.includes('Centro de Sismologia USP / BRASIS'));

// Full aggregator smoke test with deterministic fixture responses for all connected providers.
const usgsFeature = {
  type: 'Feature', id: 'usgs-feed-test',
  properties: { mag: 2.0, magType: 'mb', place: 'Brazil', time: nowMs, updated: nowMs, url: 'https://earthquake.usgs.gov/test', status: 'automatic', tsunami: 0 },
  geometry: { type: 'Point', coordinates: [-47.0, -14.0, 9] },
};
const emscFeature = {
  type: 'Feature', id: 'emsc-test',
  properties: { mag: 2.3, time: iso, last_update: iso, flynn_region: 'Brasil', magtype: 'ML', eventid: 'emsc-test' },
  geometry: { type: 'Point', coordinates: [-46.0, -18.0, 7] },
};
const sisbraFixture = `${y} ${mo}${d} ${compactTime} -12.0 -45.0 0 GO 8.5 2.4 ML A 3 0 Goiânia (UnB,UFRN,IAG)`;
const originalFetch = globalThis.fetch;
const calls = new Map();
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  calls.set(url.hostname, (calls.get(url.hostname) || 0) + 1);
  const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  const xml = (data) => new Response(data, { status: 200, headers: { 'content-type': 'application/xml' } });
  const html = (data) => new Response(data, { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.hostname === 'earthquake.usgs.gov' && url.pathname.includes('/summary/')) return json({ type: 'FeatureCollection', features: [usgsFeature] });
  if (url.hostname === 'earthquake.usgs.gov' && url.pathname.includes('/fdsnws/event/')) return xml(quakeML('usgs-fdsn-test', -15.0, -46.5, 2.0, 'Brazil'));
  if (url.hostname === 'www.moho.iag.usp.br') return xml(quakeML('usp-live-test', -16.2, -48.9, 2.1, 'Brasil'));
  if (url.hostname === 'labsis.ufrn.br') return html(labsisHTML);
  if (url.hostname === 'obsis.unb.br') return html(unbHTML);
  if (url.hostname === 'unimontes.br' && url.pathname.includes('projetos-e-servicos')) return html('<a href="/wp-content/Boletim-Sismologico-2026.pdf">Boletim Sísmico 2026</a>');
  if (url.hostname === 'unimontes.br') return new Response('<rss><channel></channel></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  if (url.hostname === 'sismo.iag.usp.br') return new Response(sisbraLine, { status: 200, headers: { 'content-type': 'text/plain' } });
  if (url.hostname === 'www.seismicportal.eu') return json({ type: 'FeatureCollection', features: [emscFeature] });
  if (url.hostname === 'geofon.gfz.de') return xml(quakeML('geofon-test', -20.0, -48.0, 2.5, 'Brasil'));
  if (url.hostname === 'isc.ac.uk') return xml(quakeML('isc-test', -7.0, -41.0, 2.6, 'Brasil'));
  return new Response('not found', { status: 404 });
};
try {
  const feed = await getEarthquakeFeed('month', 1);
  assert.equal(feed.ok, true);
  assert.ok(feed.sources.some((item) => item.id === 'usgs'));
  assert.ok(feed.sources.some((item) => item.id === 'usgs-fdsn-br'));
  assert.ok(feed.sources.some((item) => item.id === 'usp-brasis'));
  assert.ok(feed.sources.some((item) => item.id === 'labsis-ufrn'));
  assert.ok(feed.sources.some((item) => item.id === 'sis-unb'));
  assert.ok(feed.sources.some((item) => item.id === 'unimontes-nes' && item.ok));
  assert.ok(feed.sources.some((item) => item.id === 'sisbra-prelim'));
  assert.ok(feed.sources.some((item) => item.id === 'emsc'));
  assert.ok(feed.sources.some((item) => item.id === 'geofon'));
  assert.ok(feed.sources.some((item) => item.id === 'isc'));
  assert.ok(feed.quakes.length >= 7);
  assert.ok(feed.brazilCount >= 7);
  assert.ok(feed.coverage.bulletinDiscovery.documents.some((item) => item.title.includes('Boletim')));
  // Brazilian events are counted by coordinates, not by the provider's country-language label.
  assert.ok(feed.globalCount < feed.count);
  assert.ok(calls.get('earthquake.usgs.gov') >= 2);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('GeoGus multi-source seismic ingestion, source attribution, deduplication and archive discovery: OK');

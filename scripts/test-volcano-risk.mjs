import assert from 'node:assert/strict';
import { assessVolcanoRisk } from '../src/volcanoRisk.ts';

const now = Date.parse('2026-11-18T15:00:00.000Z');
const volcano = {
  vn: 999999, name: 'Vulcão de teste', country: 'Teste', type: 'Estratovulcão',
  lastEruption: null, elevation: 1000, lat: 0, lon: 0,
  status: 'DORMENTE', holocene: true,
};
const base = (extra = {}) => assessVolcanoRisk(volcano, {
  quakes: [], reports: [], now, ...extra,
});
const report = (overrides = {}) => ({
  id: 'report-test', ts: now - 60 * 60_000, source: 'Observatório oficial', kind: 'OFICIAL',
  verified: 'CONFIRMADO', title: 'Boletim de teste', volcanoVn: volcano.vn,
  text: 'Atualização de monitoramento', cats: ['INQUIETACAO'], ashKm: null,
  ...overrides,
});

// PHIVOLCS: 5 = hazardous eruption in progress (RED); 4 = imminent (ORANGE).
let r = base({ quakes: [], reports: [] });
r = assessVolcanoRisk(volcano, { quakes: [], reports: [], now, });
assert.equal(r.level, 'GREEN');
assert.equal(r.pulse, false);

r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'PHIVOLCS', level: 5, noticeTime: new Date(now - 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, true);

r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'PHIVOLCS', level: 4, noticeTime: new Date(now - 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'ORANGE');
assert.equal(r.pulse, true);

// PVMBG AWAS / IV is the highest official Indonesian status. When an
// observatory reports a current elevated level but omits the bulletin date,
// the active alert state itself remains live until the source clears it.
for (const level of [4, 'IV', 'Level IV (Awas)', 'AWAS']) {
  r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'PVMBG', level }] }, { quakes: [], reports: [], now });
  assert.equal(r.level, 'RED', `PVMBG ${level} must be red`);
  assert.equal(r.pulse, true, `PVMBG ${level} active alert without date must pulse as a current source state`);
  assert.equal(r.continuing, true);
}

// Active official orange/red states without explicit bulletin dates still pulse globally.
for (const alert of [
  { source: 'PHIVOLCS', level: 4 },
  { source: 'PHIVOLCS', level: 5 },
  { source: 'USGS', level: 'WARNING', colorCode: 'ORANGE' },
  { source: 'USGS', level: 'WARNING', colorCode: 'RED' },
]) {
  r = assessVolcanoRisk({ ...volcano, alertInfos: [alert] }, { quakes: [], reports: [], now });
  assert.ok(['ORANGE', 'RED'].includes(r.level));
  assert.equal(r.pulse, true, `${alert.source} current elevated alert without timestamp must pulse`);
}

// USGS ground/aviation dimensions: WARNING+ORANGE is orange; RED aviation code is red.
r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'USGS', level: 'WARNING', colorCode: 'ORANGE', noticeTime: new Date(now - 2 * 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'ORANGE');
assert.equal(r.pulse, true);
r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'USGS', level: 'WARNING', colorCode: 'RED', noticeTime: new Date(now - 2 * 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'RED');
r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'USGS', level: 'WARNING', colorCode: 'AVIATION COLOR CODE RED', noticeTime: new Date(now - 2 * 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'RED', 'USGS aviation code with descriptive prefix must still map to red');

// Confirmed bulletin signals. Normalization recognizes the underscored tag emitted by the parser.
r = base({ reports: [report({ cats: ['ERUPCAO_MODERADA'] })] });
assert.equal(r.level, 'ORANGE');
assert.equal(r.pulse, true);
r = base({ reports: [report({ cats: ['ERUPCAO', 'CINZAS'], ashKm: 6.2 })] });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, true);
r = base({ reports: [report({ text: 'A pyroclastic flow was observed on the volcano flank', cats: ['PIROCLASTICO'] })] });
assert.equal(r.level, 'RED');
r = base({ reports: [report({ text: 'No pyroclastic flow was observed during the inspection', cats: ['PIROCLASTICO'] })] });
assert.notEqual(r.level, 'RED');
r = base({ reports: [report({ text: 'A major explosive eruption is underway at the volcano.', cats: ['EXPLOSIVA', 'ERUPCAO'] })] });
assert.equal(r.level, 'RED', 'explicit major explosive eruption in a confirmed official bulletin must be red');
r = base({ reports: [report({ text: 'No major explosive eruption was observed during the inspection.', cats: ['EXPLOSIVA'] })] });
assert.notEqual(r.level, 'RED', 'negated major eruption wording must not create red');

// A bulletin/report older than 24 hours retains its risk colour but stops pulsing.
r = assessVolcanoRisk({ ...volcano, alertInfos: [{ source: 'PHIVOLCS', level: 5, noticeTime: new Date(now - 25 * 60 * 60_000).toISOString() }] }, { quakes: [], reports: [], now });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, false);

// New/unknown official activity tags still receive their own report timestamp,
// so a currently active volcano pulses even when the category is not in the
// explicit alert-to-risk phrase table yet.
r = base({ reports: [report({ cats: ['INCANDESCENCIA'] })] });
assert.equal(r.level, 'YELLOW');
assert.equal(r.activityAt, now - 60 * 60_000);
assert.equal(r.pulse, true);
r = base({ reports: [report({ ts: now - 30 * 60 * 60_000 })] });
assert.equal(r.level, 'YELLOW'); // still a recent operational bulletin inside the 48 h evaluation window
assert.equal(r.pulse, false);

// News publication times may inform low-confidence yellow, but are not used as an event clock.
r = base({ reports: [
  report({ id: 'n1', source: 'News A', kind: 'NOTICIA', verified: 'REPORTADO', cats: ['LAVA'] }),
  report({ id: 'n2', source: 'News B', kind: 'NOTICIA', verified: 'REPORTADO', cats: ['LAVA'] }),
] });
assert.equal(r.level, 'YELLOW');
assert.equal(r.pulse, false);

// Current GVP continuing-episode VEI 4+ is red; pulsation expires after 24 h from episode start.
r = base({ ongoing: { start: '2026-11-18', end: null, vei: 4 } });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, true);
r = base({ ongoing: { start: '2026-11-16', end: null, vei: 4 } });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, true, 'a GVP eruption episode still marked as continuing remains pulsing');
assert.equal(r.continuing, true);
// A closed episode older than 24 h must stop pulsing.
r = base({ ongoing: { start: '2026-11-16', end: '2026-11-17', vei: 4 } });
assert.equal(r.level, 'RED');
assert.equal(r.pulse, false);
assert.equal(r.continuing, false);

// A single nearby tectonic event must not recolor a volcano. A measured
// increase in several shallow events can raise yellow; dense shallow swarms orange.
const recentQuake = { id: 'q1', mag: 3.6, time: now - 30 * 60_000, lat: 0.01, lon: 0.01, depthKm: 8 };
r = base({ quakes: [recentQuake] });
assert.equal(r.level, 'GREEN', 'one nearby event alone must not trigger a volcanic alert');
assert.equal(r.pulse, false);
const increasedSwarm = [1.5, 2.0, 2.2].map((mag, index) => ({
  ...recentQuake, id: `q${index + 1}`, mag, time: now - (index + 1) * 15 * 60_000,
}));
r = base({ quakes: increasedSwarm });
assert.equal(r.level, 'YELLOW');
assert.equal(r.pulse, true);
const oldQuake = { ...recentQuake, time: now - 25 * 60 * 60_000 };
r = base({ quakes: [oldQuake] });
assert.equal(r.level, 'GREEN');
assert.equal(r.pulse, false);

console.log('GeoGus volcano risk: official alert mappings, RED evidence, dated pulses and negative-signal guards: OK');

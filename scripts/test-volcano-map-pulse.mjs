import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestOfficialPvmbgBulletin, shouldPulseVolcano } from '../src/volcanoPulse.ts';

const now = Date.parse('2026-11-18T20:00:00Z');
const volcano = (overrides = {}) => ({
  risk: {
    level: 'ORANGE', rank: 2, label: 'ATENÇÃO', color: '#f97316', pulse: true,
    reasons: ['Boletim oficial recente'], sources: ['PVMBG'], seismic24h: 0,
    seismicPrevious6d: 0, seismicRadiusKm: 15, confidence: 'ALTA',
    activityAt: now - 60 * 60_000, continuing: false, updatedAt: now,
    ...overrides,
  },
});

assert.equal(shouldPulseVolcano(volcano(), now), true, 'boletim oficial recente deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ level: 'RED', rank: 3, pulse: true, activityAt: now - 2 * 60 * 60_000 }), now), true, 'perigo vermelho recente deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ level: 'YELLOW', rank: 1, pulse: true, activityAt: now - 23 * 60 * 60_000 }), now), true, 'sinal amarelo com 23 h deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ activityAt: now - 24 * 60 * 60_000 - 1 }), now), false, 'sinal acima de 24 h não deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ pulse: false }), now), true, 'evidência recente válida pulsa mesmo se o booleano derivado do motor estiver atrasado');
assert.equal(shouldPulseVolcano(volcano({ activityAt: null }), now), false, 'sem data de evidência não deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ rank: 0, level: 'GREEN', pulse: false }), now), false, 'verde não deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ continuing: true, activityAt: null }), now), true, 'erupção contínua GVP deve pulsar');
assert.equal(shouldPulseVolcano(volcano({ activityAt: now + 2 * 60_000 }), now), false, 'data futura incompatível não deve pulsar');

const items = [
  { source: 'PVMBG', kind: 'OFICIAL', verified: 'CONFIRMADO', volcanoName: 'Anak Krakatau', ts: now - 3_600_000, text: 'Atividade eruptiva' },
  { source: 'PVMBG', kind: 'OFICIAL', verified: 'CONFIRMADO', volcanoName: 'Krakatau', ts: now - 7_200_000, text: 'Boletim anterior' },
  { source: 'News', kind: 'NOTICIA', verified: 'REPORTADO', volcanoName: 'Anak Krakatau', ts: now + 1_000, text: 'Não é boletim PVMBG' },
  { source: 'PVMBG', kind: 'OFICIAL', verified: 'NAO_CONFIRMADO', volcanoName: 'Anak Krakatau', ts: now + 2_000, text: 'Não confirmado' },
];
const bulletin = latestOfficialPvmbgBulletin(items, 'Krakatau');
assert.equal(bulletin?.noticeTime, new Date(now - 3_600_000).toISOString(), 'deve usar a data mais recente do boletim oficial e resolver alias Anak Krakatau');
assert.equal(bulletin?.details, 'Atividade eruptiva');
assert.equal(latestOfficialPvmbgBulletin([], 'Mayon'), null, 'sem boletim oficial não inventar timestamp');

// Fontes regionais distintas devem ter o mesmo comportamento visual global.
for (const source of ['USGS', 'PHIVOLCS', 'PVMBG', 'Smithsonian GVP']) {
  assert.equal(shouldPulseVolcano(volcano({ sources: [source], rank: 2, level: 'ORANGE', pulse: false, activityAt: now - 90 * 60_000 }), now), true, `${source}: alerta laranja recente deve pulsar`);
  assert.equal(shouldPulseVolcano(volcano({ sources: [source], rank: 3, level: 'RED', pulse: false, activityAt: now - 90 * 60_000 }), now), true, `${source}: alerta vermelho recente deve pulsar`);
}
assert.equal(shouldPulseVolcano(volcano({ rank: 2, level: 'ORANGE', pulse: true, activityAt: now - 25 * 60 * 60_000 }), now), false, 'alerta antigo mantém cor, mas não pulsa');

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(css, /\.volc-icon\.pulse-active\.risk-orange::before/,
  'marcadores laranja precisam ter ondas circulares externas');
assert.match(css, /\.volc-icon\.pulse-active\.risk-red::before/,
  'marcadores vermelhos precisam ter ondas circulares externas');
assert.match(css, /markerShockwave[\s\S]*?infinite !important/,
  'as ondas dos vulcões precisam ter animação contínua');

console.log('OK: pulsação global, alertas oficiais sem timestamp, anéis laranja/vermelhos e boletins vulcânicos.');

assert.match(css, /volcanoShockwaveCompact[\s\S]*?scale\(1\.72\)/,
  'ondas vulcânicas devem ser menores e mais limpas');
assert.match(css, /risk-orange[\s\S]*?--pulse-duration: 2\.25s/,
  'laranja deve pulsar mais lentamente');
assert.match(css, /risk-red[\s\S]*?--pulse-duration: \.68s/,
  'vermelho deve pulsar mais rapidamente');
assert.match(css, /volcanoYellowFade[\s\S]*?opacity: \.58[\s\S]*?opacity: 1/,
  'amarelo deve apenas esmaecer sem ondas circulares');

import assert from 'node:assert/strict';
import { interpret } from '../server/reports.mjs';

const cases = [
  ['An ash plume reached 6.4 km above sea level during the eruption.', 6.4],
  ['The ash column rose to 15 km.', 15],
  ['The plume reached 21,000 ft above the crater.', 6.4],
  ['Kolom abu mencapai 6 km di atas puncak.', 6],
  ['A 6,000 m ash plume was observed above the vent.', 6],
];
for (const [text, expected] of cases) {
  const result = interpret(text);
  assert.ok(Math.abs(result.ashKm - expected) < 0.02, `${text}: expected ${expected} km, got ${result.ashKm}`);
}
assert.equal(interpret('Ash plume drifted 12 km downwind from the volcano.').ashKm, null,
  'horizontal drift distance must not be read as plume altitude');
assert.equal(interpret('Plume dispersed over a distance of 9 km east of the volcano.').ashKm, null,
  'horizontal dispersion distance must not be read as plume altitude');
console.log('GeoGus report interpretation: plume altitude, feet/metres conversion and drift false-positive guards: OK');

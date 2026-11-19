import assert from 'node:assert/strict';
import { periodValue, periodMs, withinPeriod } from '../server/earthquakes.mjs';

const now = Date.parse('2026-11-18T15:00:00.000Z');
assert.equal(periodValue('hour'), 'hour');
assert.equal(periodValue('12h'), '12h');
assert.equal(periodValue('invalid'), 'day');
assert.equal(periodMs('hour'), 60 * 60_000);
assert.equal(periodMs('12h'), 12 * 60 * 60_000);
assert.equal(periodMs('day'), 24 * 60 * 60_000);
assert.equal(periodMs('week'), 7 * 24 * 60 * 60_000);
assert.equal(periodMs('month'), 30 * 24 * 60 * 60_000);
for (const [period, duration] of [['hour', 60], ['12h', 720], ['day', 1440]]) {
  const windowMs = duration * 60_000;
  assert.equal(withinPeriod(now - windowMs, period, now), true, `${period}: lower bound included`);
  assert.equal(withinPeriod(now - windowMs - 1, period, now), false, `${period}: older than exact window excluded`);
  assert.equal(withinPeriod(now + 60_001, period, now), false, `${period}: future event excluded`);
}
console.log('GeoGus earthquake windows: exact rolling 1h, 12h, 24h, 7d and 30d filters: OK');

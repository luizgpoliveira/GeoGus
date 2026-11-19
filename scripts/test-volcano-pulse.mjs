import assert from 'node:assert/strict';
import { shouldPulseVolcano, volcanoPulseDeadline } from '../src/volcanoPulse.ts';

const now = Date.parse('2026-11-18T18:00:00.000Z');
const hour = 60 * 60_000;
assert.equal(shouldPulseVolcano(2, now - 1 * hour, now), true, 'orange recent evidence pulses');
assert.equal(shouldPulseVolcano(3, now - 23 * hour, now), true, 'red recent evidence pulses');
assert.equal(shouldPulseVolcano(1, now - 24 * hour - 1, now), false, 'yellow older than 24h does not pulse');
assert.equal(shouldPulseVolcano(2, now - 25 * hour, now), false, 'orange older than 24h does not pulse');
assert.equal(shouldPulseVolcano(3, now - 48 * hour, now), false, 'continuing red without fresh evidence does not pulse');
assert.equal(shouldPulseVolcano(3, now + 30_000, now), true, 'small source clock skew is tolerated');
assert.equal(shouldPulseVolcano(3, now + 2 * hour, now), false, 'future evidence beyond tolerance does not pulse');
assert.equal(shouldPulseVolcano(0, now - hour, now), false, 'green does not pulse');
assert.equal(volcanoPulseDeadline(now - hour), now - hour + 24 * hour + 1);
assert.equal(volcanoPulseDeadline(null), null);
console.log('GeoGus volcano pulse: orange/red/active signals use a strict rolling 24h evidence window: OK');

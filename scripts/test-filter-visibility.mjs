import assert from 'node:assert/strict';
import { shouldShowPeriodFilter } from '../src/filterVisibility.ts';

assert.equal(shouldShowPeriodFilter({ showQuakes: true, showVolcanoes: true }), true);
assert.equal(shouldShowPeriodFilter({ showQuakes: true, showVolcanoes: false }), true);
assert.equal(shouldShowPeriodFilter({ showQuakes: false, showVolcanoes: true }), true);
assert.equal(shouldShowPeriodFilter({ showQuakes: false, showVolcanoes: false }), false);

console.log('GeoGus filter visibility: period appears for earthquakes OR volcanoes; hides when both are off: OK');

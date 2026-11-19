import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8');
assert.match(source, /worldCopyJump\s*:\s*true/, 'Leaflet deve manter a navegação entre cópias do mundo');
assert.match(source, /setRenderWorldCopies\(true\)/, 'MapLibre deve renderizar cópias horizontais do mundo');
assert.doesNotMatch(source, /maxBounds\s*:/, 'O mapa não deve impor limite horizontal de longitude');
assert.doesNotMatch(source, /maxBoundsViscosity\s*:/, 'O mapa não deve ter resistência artificial nas bordas');
console.log('OK: navegação horizontal contínua Leaflet + MapLibre configurada.');

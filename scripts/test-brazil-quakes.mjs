import assert from 'node:assert/strict';
import { parseUSPFdsnQuakeML, mergeBrazilAndGlobal } from '../server/earthquakes.mjs';

const xml = `<?xml version="1.0"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
 <eventParameters>
  <event publicID="smi:local/event/test-br-01">
   <preferredOriginID>smi:local/origin/test-br-01</preferredOriginID>
   <preferredMagnitudeID>smi:local/magnitude/test-br-01</preferredMagnitudeID>
   <description><text>Interior de Goiás</text><type>region name</type></description>
   <origin publicID="smi:local/origin/test-br-01">
    <time><value>2026-11-17T12:00:00.000Z</value></time>
    <latitude><value>-16.2</value></latitude>
    <longitude><value>-48.9</value></longitude>
    <depth><value>8500</value></depth>
    <evaluationMode>manual</evaluationMode><evaluationStatus>confirmed</evaluationStatus>
   </origin>
   <magnitude publicID="smi:local/magnitude/test-br-01"><mag><value>2.1</value></mag><type>mR</type></magnitude>
  </event>
 </eventParameters>
</q:quakeml>`;

const usp = parseUSPFdsnQuakeML(xml, 1);
assert.equal(usp.length, 1);
assert.equal(usp[0].source, 'USP');
assert.equal(usp[0].depthKm, 8.5);
assert.equal(usp[0].place, 'Interior de Goiás, Brasil');
assert.match(usp[0].status, /Revisado/);

const global = [{
  ...usp[0], id: 'usgs-test-br-01', source: 'USGS', sources: ['USGS'],
  url: 'https://earthquake.usgs.gov/test', mag: 2.0,
}];
const merged = mergeBrazilAndGlobal(global, usp);
assert.equal(merged.length, 1, 'evento coincidente não deve ser duplicado');
assert.deepEqual(new Set(merged[0].sources), new Set(['USP / RSBR', 'USGS']));

console.log('USP/RSBR QuakeML parser + deduplicação USGS: OK');

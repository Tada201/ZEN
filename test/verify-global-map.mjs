import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const spatial = read('src-tauri/src/commands/spatial.rs');
const lib = read('src-tauri/src/lib.rs');
const api = read('src/api/gtsmApi.ts');
const hydrate = read('src/components/workbench/cesium/useGlobalMapData.ts');
const map = read('src/components/workbench/MapContainer.tsx');
const entityLayers = read('src/components/workbench/cesium/useCesiumEntityLayers.ts');

assert(spatial.includes('pub async fn get_vessels'), 'Vessel cache command is missing.');
assert(spatial.includes('pub async fn get_natural_events'), 'Natural-event command is missing.');
assert(lib.includes('commands::spatial::get_vessels'), 'Vessel command is not registered.');
assert(lib.includes('commands::spatial::get_natural_events'), 'Natural-event command is not registered.');
assert(api.includes('getSatellites') && api.includes('getFlights') && api.includes('getEarthquakes'), 'Core globe APIs are incomplete.');
assert(api.includes('getMilitaryAircraft') && api.includes('getVessels') && api.includes('getNaturalEvents'), 'OSINT globe APIs are incomplete.');
assert(hydrate.includes('window.setInterval'), 'Global map data must refresh at a bounded cadence.');
assert(hydrate.includes('updateEntities'), 'Global map data must update the canonical GTSM store.');
assert(entityLayers.includes('naturalEvents.forEach'), 'Natural events must render on the Cesium globe.');
assert(!map.includes('MapLibreMapRenderer'), '2D navigation must remain disabled while the 3D globe is active.');

console.log('Global map wiring verified.');

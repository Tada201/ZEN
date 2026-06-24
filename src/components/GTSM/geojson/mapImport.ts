import { gtsmApi } from '@/api/gtsmApi';

type Position = [number, number] | [number, number, number];

export interface PreparedMapImport {
  name: string;
  geojson: string;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function parseCsvRow(line: string) {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { fields.push(value.trim()); value = ''; } else value += character;
  }
  fields.push(value.trim());
  return fields;
}

function csvToGeoJson(text: string) {
  const rows = text.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length < 2) throw new Error('CSV needs a header and at least one location row.');
  const headers = parseCsvRow(rows[0]).map((value) => value.toLowerCase().replace(/[ _-]/g, ''));
  const latitudeIndex = headers.findIndex((value) => ['lat', 'latitude', 'y'].includes(value));
  const longitudeIndex = headers.findIndex((value) => ['lon', 'lng', 'longitude', 'x'].includes(value));
  if (latitudeIndex < 0 || longitudeIndex < 0) throw new Error('CSV must include latitude and longitude columns.');
  const features = rows.slice(1).flatMap((row) => {
    const values = parseCsvRow(row);
    const latitude = Number(values[latitudeIndex]);
    const longitude = Number(values[longitudeIndex]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ type: 'Feature', properties: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])), geometry: { type: 'Point', coordinates: [longitude, latitude] } }];
  });
  if (features.length === 0) throw new Error('CSV did not contain valid location values.');
  return { type: 'FeatureCollection', features };
}

function parseCoordinates(value: string): Position[] {
  return value.trim().split(/\s+/).flatMap((item) => {
    const [longitude, latitude, altitude] = item.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [Number.isFinite(altitude) ? [longitude, latitude, altitude] : [longitude, latitude]] as Position[];
  });
}

export function kmlToGeoJson(text: string) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('KML could not be parsed.');
  const features = Array.from(document.querySelectorAll('Placemark')).flatMap((placemark) => {
    const coordinates = placemark.querySelector('coordinates')?.textContent;
    if (!coordinates) return [];
    const positions = parseCoordinates(coordinates);
    if (positions.length === 0) return [];
    const geometry = placemark.querySelector('Point') ? { type: 'Point', coordinates: positions[0] }
      : placemark.querySelector('LineString') ? { type: 'LineString', coordinates: positions }
        : placemark.querySelector('Polygon') ? { type: 'Polygon', coordinates: [positions] } : null;
    return geometry ? [{ type: 'Feature', properties: { name: placemark.querySelector('name')?.textContent?.trim() ?? '' }, geometry }] : [];
  });
  if (features.length === 0) throw new Error('KML did not contain supported Point, LineString, or Polygon placemarks.');
  return { type: 'FeatureCollection', features };
}

export async function prepareMapImport(file: File): Promise<PreparedMapImport> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Map imports are limited to 10 MB.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'kmz') {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return { name: file.name, geojson: JSON.stringify(kmlToGeoJson(await gtsmApi.extractKmzKml(bytes))) };
  }
  const text = await file.text();
  const data = extension === 'csv' ? csvToGeoJson(text)
    : extension === 'kml' ? kmlToGeoJson(text)
      : extension === 'geojson' || extension === 'json' ? JSON.parse(text)
        : (() => { throw new Error('Choose a GeoJSON, JSON, CSV, or KML file.'); })();
  return { name: file.name, geojson: JSON.stringify(data) };
}

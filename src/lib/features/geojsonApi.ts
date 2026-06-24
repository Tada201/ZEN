import { callCommand } from '@/api/tauriClient';

export interface GtsmGeojsonLayer {
  id: string;
  name: string;
  description: string;
  color: string;
  visible: number; // 0 or 1
  geojson: string; // JSON string
  featureCount: number;
  geometryTypes: string; // JSON string array
  bboxJson: string | null; // JSON string array [minX, minY, maxX, maxY]
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
}

export async function listGeojsonLayers(): Promise<GtsmGeojsonLayer[]> {
  return callCommand<GtsmGeojsonLayer[]>('list_geojson_layers_db');
}

export async function listGeojsonLayersPage(
  limit?: number,
  offset?: number
): Promise<Page<GtsmGeojsonLayer>> {
  return callCommand<Page<GtsmGeojsonLayer>>('list_geojson_layers_db_page', { limit, offset });
}

export async function saveGeojsonLayer(
  id: string,
  name: string,
  description: string,
  color: string,
  visible: boolean,
  geojson: string
): Promise<GtsmGeojsonLayer> {
  return callCommand<GtsmGeojsonLayer>('save_geojson_layer_db', {
    id,
    name,
    description,
    color,
    visible,
    geojson,
  });
}

export async function deleteGeojsonLayer(id: string): Promise<void> {
  return callCommand<void>('delete_geojson_layer_db', { id });
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { gtsmApi, type MapCameraCatalogSourceStatus, type MapConnectorMetadata } from '@/api/gtsmApi';
import { LayerManager } from './LayerManager';
import { GeoJsonLayerPanel } from './geojson/GeoJsonLayerPanel';

type SettingsTab = 'layers' | 'sources' | 'imports';

interface MapSettingsPanelProps {
  onImportFile: (file: File) => void;
}

function formatRefresh(timestamp?: number) {
  if (!timestamp) return 'Not refreshed';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  return seconds < 60 ? 'Just now' : `${Math.floor(seconds / 60)}m ago`;
}

export const MapSettingsPanel: React.FC<MapSettingsPanelProps> = ({ onImportFile }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('layers');
  const [connectors, setConnectors] = useState<MapConnectorMetadata[]>([]);
  const [cameraSources, setCameraSources] = useState<MapCameraCatalogSourceStatus[]>([]);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [cameraImportMessage, setCameraImportMessage] = useState<string | null>(null);
  const [cameraImportError, setCameraImportError] = useState<string | null>(null);
  const [isImportingCameraCatalog, setIsImportingCameraCatalog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraCatalogInputRef = useRef<HTMLInputElement>(null);
  // Keep each selector referentially stable. An object-literal selector causes
  // useSyncExternalStore to observe a new snapshot every render in Zustand v5.
  const errorLayers = useGTSMStore((state) => state.errorLayers);
  const loadingLayers = useGTSMStore((state) => state.loadingLayers);
  const layerUpdatedAt = useGTSMStore((state) => state.layerUpdatedAt);

  const failedCount = useMemo(
    () => connectors.filter((source) => errorLayers[source.id]).length
      + cameraSources.filter((source) => source.status === 'unavailable').length,
    [cameraSources, connectors, errorLayers],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([gtsmApi.listMapConnectors(), gtsmApi.getMapCameraCatalog()])
      .then(([items, cameraCatalog]) => {
        if (active) {
          setConnectors(items);
          setCameraSources(cameraCatalog.sources);
          setConnectorError(null);
        }
      })
      .catch(() => {
        if (active) setConnectorError('Source metadata is unavailable.');
      });
    return () => { active = false; };
  }, []);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onImportFile(file);
  };

  const chooseCameraCatalog = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsImportingCameraCatalog(true);
    setCameraImportMessage(null);
    setCameraImportError(null);
    try {
      const report = await gtsmApi.importLocalMapCameraCatalog(file.name, Array.from(new Uint8Array(await file.arrayBuffer())));
      const rejected = report.rejected ? `; rejected ${report.rejected} insecure or invalid ${report.rejected === 1 ? 'entry' : 'entries'}` : '';
      setCameraImportMessage(`Imported ${report.accepted} camera ${report.accepted === 1 ? 'source' : 'sources'}${rejected}.`);
      const snapshot = await gtsmApi.getMapCameraCatalog();
      setCameraSources(snapshot.sources);
    } catch (error) {
      setCameraImportError(error instanceof Error ? error.message : 'Camera catalog import failed.');
    } finally {
      setIsImportingCameraCatalog(false);
    }
  };

  return (
    <div className="pointer-events-auto relative font-mono">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Open map settings"
        className="flex h-7 items-center gap-1.5 border border-white/15 bg-black/45 px-2 text-[10px] font-medium text-zinc-100 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:bg-black/60"
      >
        <WorkbenchIcon name="solar:settings-bold-duotone" size={14} className="text-primary" />
        <span>Map settings</span>
        {failedCount > 0 && <span className="border border-rose-400/25 bg-rose-400/10 px-1.5 py-0.5 text-[9px] text-rose-200">{failedCount} issue{failedCount === 1 ? '' : 's'}</span>}
      </button>

      {open && (
        <section className="absolute right-0 top-8 z-40 flex w-[min(92vw,340px)] max-h-[min(72vh,620px)] flex-col overflow-hidden border border-white/15 bg-black/70 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <div>
              <p className="text-[11px] font-medium text-zinc-100">Map settings</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">Layers, sources, and local data</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close map settings" className="p-1 text-zinc-400 hover:text-white">
              <WorkbenchIcon name="solar:close-circle-linear" size={17} />
            </button>
          </header>

          <nav className="grid grid-cols-3 border-b border-white/10" aria-label="Map settings sections">
            {([
              ['layers', 'Layers'],
              ['sources', 'Sources'],
              ['imports', 'Imports'],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-2 py-2 text-[10px] font-medium ${tab === id ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto p-3">
            {tab === 'layers' && <LayerManager />}

            {tab === 'sources' && (
              <div className="space-y-2">
                <p className="px-1 text-[10px] leading-4 text-zinc-400">Refresh and failure status for the active data services. Source URLs remain backend-owned.</p>
                {connectorError && <p className="border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[10px] text-rose-100">{connectorError}</p>}
                {!connectorError && connectors.length === 0 && <p className="px-1 text-[10px] text-zinc-500">Loading source metadata...</p>}
                {connectors.map((source) => {
                  const error = errorLayers[source.id];
                  const loading = loadingLayers.includes(source.id);
                  return (
                    <div key={source.id} className="border border-white/10 bg-white/[0.025] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-zinc-200">{source.label}</p>
                          <p className="mt-0.5 truncate text-[9px] text-zinc-500">{source.provider} · refreshes every {source.refreshSeconds >= 3600 ? `${Math.round(source.refreshSeconds / 3600)}h` : `${source.refreshSeconds}s`}</p>
                        </div>
                        <span className={`shrink-0 text-[9px] ${error ? 'text-rose-300' : loading ? 'text-zinc-200' : 'text-emerald-300'}`}>{error ? 'Failed' : loading ? 'Updating' : formatRefresh(layerUpdatedAt[source.id])}</span>
                      </div>
                      {error && <p className="mt-2 border-l border-rose-400/50 pl-2 text-[9px] leading-4 text-rose-200">{error}</p>}
                      <p className="mt-1 text-[9px] text-zinc-500">{source.attribution}</p>
                    </div>
                  );
                })}
                {cameraSources.map((source) => (
                  <div key={source.id} className="border border-white/10 bg-white/[0.025] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-zinc-200">{source.label}</p>
                        <p className="mt-0.5 text-[9px] text-zinc-500">Camera catalog · {source.entryCount} feed{source.entryCount === 1 ? '' : 's'} · checked {formatRefresh(source.checkedAt)}</p>
                      </div>
                      <span className={`shrink-0 text-[9px] ${source.status === 'available' ? 'text-emerald-300' : source.status === 'unavailable' ? 'text-rose-300' : 'text-zinc-500'}`}>{source.status === 'available' ? 'Ready' : source.status === 'unavailable' ? 'Failed' : 'Not configured'}</span>
                    </div>
                    {source.detail && <p className={`mt-2 border-l pl-2 text-[9px] leading-4 ${source.status === 'unavailable' ? 'border-rose-400/50 text-rose-200' : 'border-white/20 text-zinc-500'}`}>{source.detail}</p>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'imports' && (
              <div className="space-y-3">
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <p className="text-[11px] font-medium text-zinc-200">Local map data</p>
                  <p className="mt-1 text-[10px] leading-4 text-zinc-400">Import GeoJSON, JSON, CSV coordinates, or KML. Files are converted to GeoJSON and validated before being saved to the local map workspace.</p>
                  <input ref={inputRef} type="file" accept=".geojson,.json,.csv,.kml,application/geo+json,application/json,text/csv,application/vnd.google-earth.kml+xml,application/xml,text/xml" className="hidden" onChange={chooseFile} />
                  <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 flex items-center gap-2 border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-medium text-zinc-100 hover:bg-white/[0.1]">
                    <WorkbenchIcon name="solar:upload-minimalistic-bold" size={14} /> Choose file
                  </button>
                </div>
                <div className="border border-dashed border-white/10 p-3 text-[10px] leading-4 text-zinc-500">
                  CSV needs latitude and longitude columns. KML supports points, lines, and polygons. KMZ files are extracted locally with bounded limits before import.
                </div>
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <p className="text-[11px] font-medium text-zinc-200">Local camera catalog</p>
                  <p className="mt-1 text-[10px] leading-4 text-zinc-400">Load a Zen camera-entry array or camera GeoJSON. Zen keeps only valid HTTPS sources and stores the cleaned catalog in local app data.</p>
                  <input ref={cameraCatalogInputRef} type="file" accept=".json,.geojson,application/json,application/geo+json" className="hidden" onChange={(event) => { void chooseCameraCatalog(event); }} />
                  <button type="button" disabled={isImportingCameraCatalog} onClick={() => cameraCatalogInputRef.current?.click()} className="mt-3 flex items-center gap-2 border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-medium text-zinc-100 hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-60">
                    <WorkbenchIcon name="solar:videocamera-add-bold" size={14} /> {isImportingCameraCatalog ? 'Importing catalog' : 'Load camera JSON'}
                  </button>
                  {cameraImportMessage ? <p className="mt-2 border-l border-emerald-400/50 pl-2 text-[10px] leading-4 text-emerald-200">{cameraImportMessage}</p> : null}
                  {cameraImportError ? <p role="alert" className="mt-2 border-l border-rose-400/50 pl-2 text-[10px] leading-4 text-rose-200">{cameraImportError}</p> : null}
                </div>
                <GeoJsonLayerPanel />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

import { useCallback, useEffect, useState } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { AppDialog } from '@/components/ui/AppDialog';
import { HlsCameraPlayer } from '@/components/GTSM/HlsCameraPlayer';
import { LocalCameraPreviewDialog } from '@/components/GTSM/LocalCameraPreviewDialog';
import {
  gtsmApi,
  type MapCameraCatalogEntry,
  type MapCameraCatalogSourceStatus,
  type MapCameraPlaybackDescriptor,
} from '@/api/gtsmApi';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';

const sourceStatusLabel: Record<MapCameraCatalogSourceStatus['status'], string> = {
  available: 'Ready',
  unavailable: 'Unavailable',
  not_configured: 'Not configured',
};

function formatCheckedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function CameraPreviewDialog({ camera, onClose }: { camera: MapCameraCatalogEntry; onClose: () => void }) {
  const [playback, setPlayback] = useState<MapCameraPlaybackDescriptor | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const startPreview = async () => {
    setIsResolving(true);
    setPlaybackError(null);
    try {
      setPlayback(await gtsmApi.resolveMapCameraPlayback(camera.id));
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : 'The preview source could not be resolved.');
    } finally {
      setIsResolving(false);
    }
  };

  const sourceUrl = playback?.sourceUrl ?? camera.sourceUrl;
  const sourceType = playback?.streamFormat ?? camera.streamFormat;

  return (
    <AppDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={camera.label}
      description={`${camera.operator} · ${sourceType.toUpperCase()} · ${camera.status}`}
      footer={<button type="button" onClick={onClose} className="border border-border px-3 py-2 text-[11px] text-foreground hover:bg-muted">Close</button>}
    >
      <div className="space-y-3">
        {camera.isDemo ? <p className="border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100">Playback diagnostic only. This is not represented as a live public camera.</p> : null}
        <div className="aspect-video border border-border bg-background">
          {!playback ? (
            <button type="button" disabled={isResolving} onClick={() => void startPreview()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-foreground hover:bg-muted/50 disabled:cursor-wait disabled:opacity-60">
              <WorkbenchIcon name="solar:play-circle-bold" size={28} className="text-primary" />
              <span className="text-xs font-medium">{isResolving ? 'Resolving source' : 'Start preview'}</span>
              <span className="text-[10px] text-muted-foreground">Playback starts only after you choose it.</span>
            </button>
          ) : playback.streamUrl && playback.directPreviewSupported ? (
            <HlsCameraPlayer playback={playback} onPlaybackError={setPlaybackError} />
          ) : <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">This catalog source does not allow direct in-app playback.</div>}
        </div>
        {playbackError ? <p role="alert" className="border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[11px] leading-5 text-rose-100">{playbackError}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-[10px] leading-5 text-muted-foreground">
          <span>Location: {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}</span>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:underline">Open source</a>
        </div>
        {camera.attribution || camera.termsUrl ? <p className="text-[10px] leading-5 text-muted-foreground">{camera.attribution ?? camera.operator}{camera.termsUrl ? <><span> · </span><a href={camera.termsUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms</a></> : null}</p> : null}
      </div>
    </AppDialog>
  );
}

export function CameraCatalogPanel() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MapCameraCatalogEntry | null>(null);
  const [localPreviewOpen, setLocalPreviewOpen] = useState(false);
  const [sources, setSources] = useState<MapCameraCatalogSourceStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const cameras = useGTSMStore((state) => state.cameras);
  const loaded = useGTSMStore((state) => state.cameraCatalogLoaded);
  const setCameras = useGTSMStore((state) => state.setCameras);
  const setLocalCamera = useGTSMStore((state) => state.setLocalCamera);
  const viewportCenter = useGTSMStore((state) => state.viewportCenter);
  const setFlyToRequest = useGTSMStore((state) => state.setFlyToRequest);
  const setLayerError = useGTSMStore((state) => state.setLayerError);
  const setLoadingLayer = useGTSMStore((state) => state.setLoadingLayer);
  const setLayerUpdatedAt = useGTSMStore((state) => state.setLayerUpdatedAt);

  const refreshCatalog = useCallback(async () => {
    setLoadingLayer('cameras', true);
    try {
      const snapshot = await gtsmApi.getMapCameraCatalog();
      setCameras(snapshot.entries);
      setSources(snapshot.sources);
      setCheckedAt(snapshot.fetchedAt);
      setLayerUpdatedAt('cameras', snapshot.fetchedAt);
      setLayerError('cameras', null);
    } catch {
      setLayerError('cameras', 'Camera catalog is unavailable.');
    } finally {
      setLoadingLayer('cameras', false);
    }
  }, [setCameras, setLayerError, setLayerUpdatedAt, setLoadingLayer]);

  useEffect(() => {
    if (!loaded) void refreshCatalog();
  }, [loaded, refreshCatalog]);

  const inspect = (camera: MapCameraCatalogEntry) => {
    setFlyToRequest({ lat: camera.latitude, lon: camera.longitude, alt: 25_000 });
    setSelected(camera);
  };

  return (
    <>
      <div className="pointer-events-auto relative font-mono">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex h-7 items-center gap-1.5 border border-border bg-background/45 px-2 text-[10px] font-medium text-foreground shadow-lg shadow-black/30 backdrop-blur-md hover:bg-background/60">
          <WorkbenchIcon name="solar:videocamera-record-bold" size={14} className="text-primary" />
          <span>Cameras</span>
          <span className="text-muted-foreground">{cameras.length}</span>
        </button>
        {open ? (
          <section className="absolute right-0 top-8 z-40 w-[min(92vw,340px)] border border-border bg-background/85 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div><p className="text-[11px] font-medium text-foreground">Camera catalog</p><p className="mt-0.5 text-[10px] text-muted-foreground">Vetted sources only{checkedAt ? ` · checked ${formatCheckedAt(checkedAt)}` : ''}</p></div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void refreshCatalog()} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Refresh camera catalog"><WorkbenchIcon name="solar:refresh-linear" size={15} /></button>
                <button type="button" onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close camera catalog"><WorkbenchIcon name="solar:close-circle-linear" size={16} /></button>
              </div>
            </header>
            <div className="max-h-[min(52vh,420px)] overflow-y-auto p-2">
              {sources.map((source) => <div key={source.id} className="border-b border-border px-2 py-2 last:border-b-0"><div className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-foreground">{source.label}</span><span className={source.status === 'available' ? 'text-success' : source.status === 'unavailable' ? 'text-destructive' : 'text-muted-foreground'}>{sourceStatusLabel[source.status]}</span></div>{source.detail ? <p className="mt-1 text-[9px] leading-4 text-muted-foreground">{source.detail}</p> : null}</div>)}
              {cameras.length === 0 ? <p className="px-2 py-5 text-center text-[11px] text-muted-foreground">No vetted camera feeds are configured.</p> : cameras.map((camera) => (
                <button key={camera.id} type="button" onClick={() => inspect(camera)} className="w-full border-b border-border px-2 py-2.5 text-left last:border-b-0 hover:bg-muted/50">
                  <div className="flex items-start gap-2"><WorkbenchIcon name="solar:videocamera-record-bold" size={14} className="mt-0.5 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-foreground">{camera.label}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground">{camera.operator} · {camera.isDemo ? 'diagnostic' : camera.status}</p></div><WorkbenchIcon name="solar:arrow-right-linear" size={13} className="text-muted-foreground" /></div>
                </button>
              ))}
              <button type="button" onClick={() => setLocalPreviewOpen(true)} className="mt-2 flex w-full items-center gap-2 border border-dashed border-border px-2 py-2.5 text-left text-[10px] text-foreground hover:bg-muted/50">
                <WorkbenchIcon name="solar:camera-add-bold" size={14} className="text-primary" />
                <span className="flex-1">Use this device camera</span>
                <span className="text-[9px] text-muted-foreground">local only</span>
              </button>
            </div>
          </section>
        ) : null}
      </div>
      {selected ? <CameraPreviewDialog camera={selected} onClose={() => setSelected(null)} /> : null}
      {localPreviewOpen ? <LocalCameraPreviewDialog latitude={viewportCenter.lat} longitude={viewportCenter.lon} onActive={() => setLocalCamera({ label: 'This device camera', latitude: viewportCenter.lat, longitude: viewportCenter.lon })} onClose={() => { setLocalCamera(null); setLocalPreviewOpen(false); }} /> : null}
    </>
  );
}

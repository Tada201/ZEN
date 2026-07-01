import { useEffect, useRef, useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';

interface LocalCameraPreviewDialogProps {
  latitude: number;
  longitude: number;
  onActive: () => void;
  onClose: () => void;
}

export function LocalCameraPreviewDialog({ latitude, longitude, onActive, onClose }: LocalCameraPreviewDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onActiveRef = useRef(onActive);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { onActiveRef.current = onActive; }, [onActive]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This WebView does not expose a local camera API.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
        onActiveRef.current();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Camera permission was not granted.');
      }
    };
    void start();
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const close = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onClose();
  };

  return <AppDialog open onOpenChange={(open) => { if (!open) close(); }} title="This device camera" description="Local preview only. Video stays on this device and is not sent to Zen services." footer={<button type="button" onClick={close} className="border border-border px-3 py-2 text-[11px] text-foreground hover:bg-muted">Stop camera</button>}>
    <div className="space-y-3"><div className="aspect-video bg-background">{error ? <div role="alert" className="flex h-full items-center justify-center px-6 text-center text-xs text-rose-200">{error}</div> : <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />}</div><p className="text-[10px] leading-5 text-muted-foreground">{ready ? `Map marker follows the current viewport: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}.` : 'Requesting local camera permission...'}</p></div>
  </AppDialog>;
}

import { useEffect, useRef, useState } from 'react';
import type { MapCameraPlaybackDescriptor } from '@/api/gtsmApi';

interface HlsCameraPlayerProps {
  playback: MapCameraPlaybackDescriptor;
  onPlaybackError: (message: string) => void;
}

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';

/**
 * The source URL comes only from resolve_map_camera_playback after a user
 * chooses a vetted catalog entry. hls.js is lazy-loaded to keep it out of the
 * primary chat bundle and is destroyed when this preview unmounts.
 */
export function HlsCameraPlayer({ playback, onPlaybackError }: HlsCameraPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(playback.streamFormat === 'hls');

  useEffect(() => {
    const video = videoRef.current;
    const streamUrl = playback.streamUrl;
    if (!video || !streamUrl) return;

    let active = true;
    let destroyHls: (() => void) | undefined;
    const report = (message: string) => {
      if (active) onPlaybackError(message);
    };

    const start = async () => {
      try {
        if (playback.streamFormat === 'mp4') {
          video.src = streamUrl;
        } else if (playback.streamFormat === 'hls' && video.canPlayType(HLS_MIME_TYPE)) {
          video.src = streamUrl;
        } else if (playback.streamFormat === 'hls') {
          const { default: Hls } = await import('hls.js');
          if (!active) return;
          if (!Hls.isSupported()) {
            report('This device does not expose a supported HLS playback path.');
            return;
          }
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            report(`Camera stream failed: ${data.details}`);
            hls.destroy();
          });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          destroyHls = () => hls.destroy();
        } else {
          report('This catalog source does not permit direct in-app playback.');
          return;
        }

        await video.play().catch(() => undefined);
        if (active) setIsLoading(false);
      } catch (error) {
        report(error instanceof Error ? error.message : 'The camera stream could not be started.');
      }
    };

    void start();
    return () => {
      active = false;
      destroyHls?.();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [onPlaybackError, playback.streamFormat, playback.streamUrl]);

  return (
    <div className="relative h-full w-full bg-background">
      {isLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-[11px] text-foreground">Loading stream...</div> : null}
      <video
        ref={videoRef}
        controls
        playsInline
        className="h-full w-full bg-background object-contain"
        onCanPlay={() => setIsLoading(false)}
        onError={() => onPlaybackError('This camera stream could not be decoded by the current WebView.')}
      />
    </div>
  );
}

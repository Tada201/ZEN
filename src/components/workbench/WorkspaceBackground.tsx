import { useMemo, type CSSProperties } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { toAssetUrl } from '@/lib/utils/assetUrl';
import { callCommand } from '@/api/tauriClient';

function quoteCssUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getBackgroundDisplayStyle(fit: string): Pick<CSSProperties, "backgroundSize" | "backgroundRepeat"> {
  switch (fit) {
    case "contain":
      return { backgroundSize: "contain", backgroundRepeat: "no-repeat" };
    case "stretch":
      return { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" };
    case "original":
      return { backgroundSize: "auto", backgroundRepeat: "no-repeat" };
    case "tile":
      return { backgroundSize: "auto", backgroundRepeat: "repeat" };
    case "cover":
    default:
      return { backgroundSize: "cover", backgroundRepeat: "no-repeat" };
  }
}

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

function getExtension(url: string): string {
  const clean = url.split(/[?#]/, 1)[0] ?? "";
  return clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
}

function isVideoBackground(url: string, mediaType: string): boolean {
  if (mediaType === "video") return VIDEO_EXTENSIONS.has(getExtension(url));
  if (mediaType === "image") return false;
  return VIDEO_EXTENSIONS.has(getExtension(url));
}

function getVideoDisplayStyle(fit: string): Pick<CSSProperties, "objectFit"> {
  switch (fit) {
    case "contain":
      return { objectFit: "contain" };
    case "stretch":
      return { objectFit: "fill" };
    case "original":
      return { objectFit: "none" };
    case "tile":
    case "cover":
    default:
      return { objectFit: "cover" };
  }
}

/**
 * WorkspaceBackground - A modular background component that renders solid backdrops,
 * custom vignette grids, and the user's custom blurred wallpaper dynamically.
 */
export function WorkspaceBackground() {
  const backgroundImageUrl = useSettingsStore(s => s.backgroundImageUrl ?? "");
  const backgroundOpacity = useSettingsStore(s => s.backgroundOpacity ?? 0.15);
  const backgroundBlur = useSettingsStore(s => s.backgroundBlur ?? 0);
  const backgroundFit = useSettingsStore(s => s.backgroundFit ?? "cover");
  const backgroundMediaType = useSettingsStore(s => s.backgroundMediaType ?? "auto");
  const optimizedVideos = useSettingsStore(s => s.optimizedVideos ?? []);
  const updateSetting = useSettingsStore(s => s.updateSetting);

  const isOptimized = useMemo(() => optimizedVideos.includes(backgroundImageUrl), [optimizedVideos, backgroundImageUrl]);

  const reprocess = async () => {
    const outputPath = backgroundImageUrl.replace(/\.[^/.]+$/, "_opt.mp4");
    try {
      await callCommand("reprocess_video", { inputPath: backgroundImageUrl, outputPath });
      updateSetting("optimizedVideos", [...optimizedVideos, backgroundImageUrl]);
    } catch (e) {
      console.error("Failed to reprocess video:", e);
    }
  };

  // Convert local file paths to Tauri asset-protocol URLs the webview can load
  const resolvedUrl = useMemo(() => toAssetUrl(backgroundImageUrl), [backgroundImageUrl]);
  const cssUrl = useMemo(() => quoteCssUrl(resolvedUrl), [resolvedUrl]);
  const displayStyle = useMemo(() => getBackgroundDisplayStyle(backgroundFit), [backgroundFit]);
  const videoBackground = useMemo(
    () => isVideoBackground(backgroundImageUrl, backgroundMediaType),
    [backgroundImageUrl, backgroundMediaType]
  );
  const videoStyle = useMemo(() => getVideoDisplayStyle(backgroundFit), [backgroundFit]);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none w-full h-full overflow-hidden select-none">
      {/* Deep baseline solid color */}
      <div className="absolute inset-0 bg-background" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-vignette-grid opacity-[0.25] mix-blend-overlay" />

      {resolvedUrl && videoBackground && !isOptimized && (
        <div className="absolute bottom-4 right-4 z-10 bg-yellow-900/80 p-3 rounded text-xs text-yellow-100 border border-yellow-700 pointer-events-auto cursor-pointer" onClick={reprocess}>
          Video not optimized. Click to reprocess for better performance.
        </div>
      )}

      {/* User Custom Wallpaper */}
      {resolvedUrl && videoBackground && (
        <video
          className="absolute inset-0 h-full w-full transition-all duration-500 ease-in-out [will-change:transform,opacity,filter]"
          src={resolvedUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          style={{
            ...videoStyle,
            opacity: backgroundOpacity,
            filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
            // Scale and translate3d to force dedicated GPU composite layer isolation and eliminate edge bleeds
            transform: backgroundBlur > 0 ? 'scale(1.03) translate3d(0,0,0)' : 'scale(1.01) translate3d(0,0,0)',
          }}
        />
      )}

      {resolvedUrl && !videoBackground && (
        <div
          className="absolute inset-0 bg-center transition-all duration-500 ease-in-out [will-change:transform,opacity,filter]"
          style={{
            backgroundImage: `url("${cssUrl}")`,
            ...displayStyle,
            opacity: backgroundOpacity,
            filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
            // Scale and translate3d to force dedicated GPU composite layer isolation and eliminate edge bleeds
            transform: backgroundBlur > 0 ? 'scale(1.03) translate3d(0,0,0)' : 'scale(1.01) translate3d(0,0,0)',
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Camera, ExternalLink, Play, Square } from "lucide-react";
import { SandboxedIframe } from "@/atlas/components/SandboxedIframe";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import type { BoardWidget } from "./types";
import "maplibre-gl/dist/maplibre-gl.css";

export function BoardMap({ widget }: { widget: BoardWidget }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || widget.latitude == null || widget.longitude == null) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [widget.longitude, widget.latitude],
      zoom: widget.zoom ?? 11,
      attributionControl: false,
    });
    new maplibregl.Marker({ color: "#ffffff" })
      .setLngLat([widget.longitude, widget.latitude])
      .addTo(map);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => map.resize());
    observer?.observe(containerRef.current);
    return () => {
      observer?.disconnect();
      map.remove();
    };
  }, [widget.latitude, widget.longitude, widget.zoom]);

  if (widget.latitude == null || widget.longitude == null) {
    return <div className="p-4 text-sm text-primary-foreground/60">{widget.location || "Map coordinates unavailable."}</div>;
  }
  return <div ref={containerRef} className="h-full min-h-0 w-full bg-background" aria-label={widget.title || "Map"} />;
}

function youtubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes("youtu.be")
      ? parsed.pathname.slice(1)
      : parsed.hostname.includes("youtube.com")
        ? parsed.searchParams.get("v")
        : null;
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

export function BoardVideo({ widget }: { widget: BoardWidget }) {
  const [playing, setPlaying] = useState(false);
  const embed = widget.url ? youtubeEmbed(widget.url) : null;
  if (!widget.url || !isSafeGeneratedHref(widget.url)) return <div className="p-4 text-sm text-primary-foreground/60">Video URL was blocked.</div>;

  if (playing && embed) {
    return (
      <iframe
        title={widget.title || "Video"}
        src={embed}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="encrypted-media; picture-in-picture"
        className="h-full min-h-0 w-full border-0"
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-background">
      {widget.thumbnail && isSafeGeneratedHref(widget.thumbnail) && <img src={widget.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <button type="button" onClick={() => embed ? setPlaying(true) : window.open(widget.url, "_blank", "noopener,noreferrer")} className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-border/30 bg-background/70 text-primary-foreground" aria-label={embed ? "Play video" : "Open video"}>
        {embed ? <Play className="h-5 w-5 fill-current" /> : <ExternalLink className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function BoardCamera({ widget }: { widget: BoardWidget }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const mountedRef = useRef(true);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, []);

  const start = async () => {
    if (isStarting || active || streamRef.current) return;
    setError(null);
    setIsStarting(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported by this runtime.");
      setIsStarting(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActive(true);
    } catch (cause) {
      if (!mountedRef.current) return;
      const name = cause instanceof DOMException ? cause.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access and try again."
          : name === "NotReadableError"
            ? "The camera is busy in another application."
            : name === "NotFoundError"
              ? "No camera was detected."
              : "The camera could not be started."
      );
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-background">
      <video ref={videoRef} autoPlay muted playsInline className={active ? "h-full w-full object-cover" : "hidden"} />
      {!active && <button type="button" disabled={isStarting} onClick={(event) => { event.stopPropagation(); void start(); }} className="flex items-center gap-2 rounded-md border border-border/20 bg-card/[0.04] px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Camera className="h-4 w-4" />{isStarting ? "Starting..." : "Enable camera"}</button>}
      {active && <button type="button" onClick={(event) => { event.stopPropagation(); stop(); }} className="absolute right-3 top-3 flex items-center gap-2 rounded-md bg-background/70 px-3 py-2 text-xs text-primary-foreground"><Square className="h-3 w-3" />Stop</button>}
      {error && <div className="absolute bottom-3 text-xs text-red-300">{error}</div>}
      <span className="sr-only">{widget.description}</span>
    </div>
  );
}

export function BoardHtml({ widget }: { widget: BoardWidget }) {
  return <SandboxedIframe content={widget.content || ""} title={widget.title || "HTML artifact"} className="h-full min-h-0 w-full" />;
}

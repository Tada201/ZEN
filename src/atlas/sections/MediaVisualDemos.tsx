/*
 * [DEMO-ONLY] MediaVisualDemos - Media showcase
 * Medium GPU impact: Webcam video, canvas operations, image lightbox
 * Only renders in design system explorer, NOT in main chat flow
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Download, LayoutGrid, Music, Rows3, Search, Share2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Captions_ from "yet-another-react-lightbox/plugins/captions";

// Simple throttle utility
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

const SAMPLE_IMAGES = [
  { src: "https://picsum.photos/seed/Zen1/1200/800", title: "Mountain Vista", desc: "Morning light over alpine peaks", tag: "Nature" },
  { src: "https://picsum.photos/seed/Zen2/1200/800", title: "Urban Geometry", desc: "Modern architecture patterns", tag: "Urban" },
  { src: "https://picsum.photos/seed/Zen3/1200/800", title: "Abstract Flow", desc: "Fluid dynamics simulation", tag: "Abstract" },
  { src: "https://picsum.photos/seed/Zen4/1200/800", title: "Coastal Drift", desc: "Long exposure shoreline", tag: "Nature" },
  { src: "https://picsum.photos/seed/Zen5/800/1200", title: "Forest Canopy", desc: "Looking up through redwoods", tag: "Nature" },
  { src: "https://picsum.photos/seed/Zen6/1200/800", title: "Desert Dunes", desc: "Golden hour sand textures", tag: "Nature" },
  { src: "https://picsum.photos/seed/Zen7/1200/800", title: "Neon Alley", desc: "Cyberpunk side street", tag: "Urban" },
  { src: "https://picsum.photos/seed/Zen8/1200/800", title: "Liquid Light", desc: "Refraction studies", tag: "Abstract" },
];


export function ImageGallery() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [layout, setLayout] = useState<"grid" | "masonry">("grid");

  const tags = useMemo(() => Array.from(new Set(SAMPLE_IMAGES.map((i) => i.tag))), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_IMAGES.filter((i) => {
      if (tag && i.tag !== tag) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.desc.toLowerCase().includes(q) ||
        i.tag.toLowerCase().includes(q)
      );
    });
  }, [query, tag]);

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => setLayout("grid")}
            aria-pressed={layout === "grid"}
            className={`rounded p-1 ${layout === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            aria-label="Grid layout"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setLayout("masonry")}
            aria-pressed={layout === "masonry"}
            className={`rounded p-1 ${layout === "masonry" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            aria-label="Masonry layout"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setTag(null)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
            !tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          All
        </button>
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setTag(tag === t ? null : t)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
              tag === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Grid / masonry */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No images match your filters.
        </div>
      ) : layout === "masonry" ? (
        <div className="columns-2 gap-2 sm:columns-3">
          {filtered.map((img, i) => (
            <button
              key={img.src}
              onClick={() => { setIndex(i); setOpen(true); }}
              className="mb-2 block w-full overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img
                src={img.src.replace('/1200/', '/400/').replace('/800/', '/400/')}
                alt={img.title}
                className="w-full transition duration-300 hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filtered.map((img, i) => (
            <button
              key={img.src}
              onClick={() => { setIndex(i); setOpen(true); }}
              className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img
                src={img.src.replace('/1200/', '/400/').replace('/800/', '/400/')}
                alt={img.title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col items-start justify-end bg-gradient-to-t from-black/70 via-black/0 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white backdrop-blur">
                  {img.tag}
                </span>
                <span className="mt-1 text-xs font-semibold text-white">{img.title}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={filtered.map((i) => ({ src: i.src, title: i.title, description: i.desc }))}
        plugins={[Thumbnails, Zoom, Slideshow, Captions_]}
        thumbnails={{ position: "bottom", gap: 4, imageFit: "cover" }}
        slideshow={{ autoplay: false, delay: 3000 }}
        toolbar={{
          buttons: [
            <button
              key="dl"
              type="button"
              className="yarl__button"
              aria-label="Download"
              onClick={() => {
                const link = document.createElement("a");
                link.href = filtered[index].src;
                link.download = filtered[index].title;
                link.target = "_blank";
                link.click();
              }}
            >
              <Download className="h-4 w-4" />
            </button>,
            <button
              key="sh"
              type="button"
              className="yarl__button"
              aria-label="Share"
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ title: filtered[index].title, url: filtered[index].src });
                  else {
                    await navigator.clipboard.writeText(filtered[index].src);
                    toast.success("Image URL copied");
                  }
                } catch { /* user cancelled */ }
              }}
            >
              <Share2 className="h-4 w-4" />
            </button>,
            "close",
          ],
        }}
      />
    </div>
  );
}


export function WebcamTile() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setOn(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Camera unavailable");
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
  };

  const snapshot = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `snapshot-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Snapshot saved");
    });
  };

  useEffect(() => () => stop(), []);

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {!on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <CameraOff className="h-6 w-6" />
            <span className="text-xs">Camera is off</span>
          </div>
        )}
        {on && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-[10px] font-medium text-destructive-foreground"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive-foreground" /> LIVE</span>}
      </div>
      <div className="flex items-center gap-2">
        {!on ? (
          <button onClick={start} className="press flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Camera className="h-3.5 w-3.5" /> Start camera
          </button>
        ) : (
          <>
            <button onClick={snapshot} className="press flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
              Snapshot
            </button>
            <button onClick={stop} className="press rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
              Stop
            </button>
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}


type DroppedFile = { name: string; size: number; type: string; url: string };

export function DropZoneTile() {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | null) => {
    if (!list) return;
    const next: DroppedFile[] = [];
    Array.from(list).forEach((f) => {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/") && !f.type.startsWith("audio/")) return;
      next.push({ name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f) });
    });
    setFiles((prev) => [...next, ...prev].slice(0, 6));
  };

  const remove = (idx: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); accept(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition ${
          hover ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <Upload className={`h-7 w-7 ${hover ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium">Drop media here</p>
        <p className="text-[11px] text-muted-foreground">images, video, audio · up to 6 files</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {files.map((f, i) => (
            <li key={f.url} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
              {f.type.startsWith("image/") && <img src={f.url} alt={f.name} className="h-full w-full object-cover" />}
              {f.type.startsWith("video/") && <video src={f.url} className="h-full w-full object-cover" muted />}
              {f.type.startsWith("audio/") && (
                <div className="flex h-full items-center justify-center text-muted-foreground"><Music className="h-5 w-5" /></div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                {f.name}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export function CompareSlider() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);
  
  // Throttle updates to 60fps
  const update = useCallback(throttle((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, 16), []);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const x = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      update(x);
    };
    const stop = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", stop);
    };
  }, [update]);

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
      <div
        ref={wrapRef}
        onMouseDown={(e) => { dragging.current = true; update(e.clientX); }}
        onTouchStart={(e) => { dragging.current = true; update(e.touches[0].clientX); }}
        className="relative aspect-video w-full select-none overflow-hidden rounded-lg border border-border bg-muted"
      >
        <img
          src="https://picsum.photos/seed/compareA/800/450"
          alt="Before"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${pos}%` }}
        >
          <img
            src="https://picsum.photos/seed/compareB/800/450"
            alt="After"
            className="h-full w-[100vw] max-w-none object-cover"
            style={{ width: wrapRef.current?.clientWidth ?? "100%" }}
            draggable={false}
          />
        </div>

        {/* labels */}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">After</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Before</span>

        {/* divider */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90 shadow-lg" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary p-1.5 shadow-lg">
            <div className="flex items-center gap-0.5">
              <div className="h-2 w-0.5 bg-white" />
              <div className="h-3 w-0.5 bg-white" />
              <div className="h-2 w-0.5 bg-white" />
            </div>
          </div>
        </div>
      </div>
      <input
        type="range" min={0} max={100} value={pos}
        onChange={(e) => setPos(parseFloat(e.target.value))}
        className="h-1 w-full appearance-none rounded-full bg-muted accent-primary"
        aria-label="Compare position"
      />
    </div>
  );
}


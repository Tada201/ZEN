import { useCallback, useEffect, useRef, useState } from "react";
import {
  Captions, Gauge, Loader2, Maximize, Minimize, Pause, PictureInPicture2,
  Play, SkipBack, SkipForward, Volume2, VolumeX,
} from "lucide-react";
import { toast } from "sonner";

const formatTime = (t: number) => {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};
const VIDEO_SRC = "/media/video.mp4";
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [rate, setRate] = useState(1);
  const [showRate, setShowRate] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const handleSeekClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
  }, []);

  const handleSeekHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(x);
    setHoverPct(Math.max(0, Math.min(1, x / rect.width)));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch { toast.error("Picture-in-picture not available"); }
  }, []);

  // Auto-hide controls
  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2200);
  }, []);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  // Fullscreen + PiP listeners
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    const v = videoRef.current;
    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);
    v?.addEventListener("enterpictureinpicture", onEnter);
    v?.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      v?.removeEventListener("enterpictureinpicture", onEnter);
      v?.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  // Keyboard shortcuts when wrapper is focused/hovered
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onKey = (e: KeyboardEvent) => {
      if (!wrap.matches(":hover") && document.activeElement !== wrap) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "arrowright": e.preventDefault(); seekBy(5); break;
        case "arrowleft": e.preventDefault(); seekBy(-5); break;
        case "j": seekBy(-10); break;
        case "l": seekBy(10); break;
        case "m": {
          const v = videoRef.current; if (!v) return;
          v.muted = !v.muted; setMuted(v.muted); break;
        }
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "p": togglePip(); break;
        case "c": setCaptionsOn((c) => !c); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, togglePip]);

  const updateBuffered = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const b = v.buffered;
    if (b.length > 0) setBuffered((b.end(b.length - 1) / v.duration) * 100);
  }, []);

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
      <div
        ref={wrapRef}
        tabIndex={0}
        onMouseMove={bumpControls}
        onMouseLeave={() => playing && setShowControls(false)}
        className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          playsInline
          className="h-full w-full"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setLoading(false); }}
          onWaiting={() => setLoading(true)}
          onPlaying={() => setLoading(false)}
          onProgress={updateBuffered}
          onEnded={() => setPlaying(false)}
          onClick={togglePlay}
        />

        {captionsOn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4">
            <span className="rounded bg-background/70 px-3 py-1 text-xs font-medium text-primary-foreground">
              [Demo caption — “C” to toggle]
            </span>
          </div>
        )}

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <Loader2 className="h-8 w-8 animate-spin text-primary-foreground/80" />
          </div>
        )}

        {!playing && !loading && (
          <button
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-background/20 transition hover:bg-background/30"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg backdrop-blur transition hover:scale-105">
              <Play className="ml-1 h-7 w-7" fill="currentColor" />
            </div>
          </button>
        )}

        {/* Bottom control bar */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent p-3 transition-opacity duration-200 ${
            showControls || !playing ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Progress + hover preview */}
          <div
            ref={progressRef}
            onClick={handleSeekClick}
            onMouseMove={handleSeekHover}
            onMouseLeave={() => setHoverPct(null)}
            className="group/seek relative h-1.5 w-full cursor-pointer rounded-full bg-card/20"
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-card/30" style={{ width: `${buffered}%` }} />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition group-hover/seek:opacity-100"
              style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            {hoverPct !== null && (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground"
                style={{ left: hoverX }}
              >
                {formatTime(hoverPct * (duration || 0))}
              </div>
            )}
          </div>

          {/* Buttons row */}
          <div className="mt-2 flex items-center gap-1.5 text-primary-foreground">
            <button onClick={togglePlay} aria-label="Play/Pause" className="press rounded-md p-1.5 hover:bg-card/10">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={() => seekBy(-10)} aria-label="Back 10s" className="press rounded-md p-1.5 hover:bg-card/10">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={() => seekBy(10)} aria-label="Forward 10s" className="press rounded-md p-1.5 hover:bg-card/10">
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Volume */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setShowVolume(true)}
              onMouseLeave={() => setShowVolume(false)}
            >
              <button
                onClick={() => {
                  const v = videoRef.current; if (!v) return;
                  v.muted = !muted; setMuted(!muted);
                }}
                aria-label="Mute"
                className="press rounded-md p-1.5 hover:bg-card/10"
              >
                {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div className={`overflow-hidden transition-[width] duration-200 ${showVolume ? "w-20" : "w-0"}`}>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = videoRef.current; if (!v) return;
                    const val = parseFloat(e.target.value);
                    v.volume = val; setVolume(val);
                    if (val > 0 && muted) { v.muted = false; setMuted(false); }
                  }}
                  className="ml-2 h-1 w-16 appearance-none rounded-full bg-card/30 accent-primary"
                  aria-label="Volume"
                />
              </div>
            </div>

            <span className="ml-1 font-mono text-[11px] tabular-nums text-primary-foreground/85">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* Captions */}
              <button
                onClick={() => setCaptionsOn((c) => !c)}
                aria-label="Toggle captions"
                aria-pressed={captionsOn}
                className={`press rounded-md p-1.5 hover:bg-card/10 ${captionsOn ? "text-primary" : ""}`}
              >
                <Captions className="h-4 w-4" />
              </button>

              {/* Speed */}
              <div className="relative">
                <button
                  onClick={() => setShowRate((s) => !s)}
                  className="press flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium hover:bg-card/10"
                  aria-label="Playback speed"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {rate}×
                </button>
                {showRate && (
                  <div className="absolute bottom-full right-0 mb-1 flex flex-col rounded-md border border-border bg-card p-1 text-foreground shadow-lg">
                    {PLAYBACK_RATES.map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          const v = videoRef.current; if (!v) return;
                          v.playbackRate = r; setRate(r); setShowRate(false);
                        }}
                        className={`press rounded px-3 py-1 text-left text-xs hover:bg-muted ${
                          r === rate ? "font-semibold text-primary" : ""
                        }`}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* PiP */}
              <button
                onClick={togglePip}
                aria-label="Picture in picture"
                aria-pressed={pip}
                className={`press rounded-md p-1.5 hover:bg-card/10 ${pip ? "text-primary" : ""}`}
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                aria-label="Fullscreen"
                className="press rounded-md p-1.5 hover:bg-card/10"
              >
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Shortcuts: <kbd className="rounded border border-border bg-muted px-1">Space</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">←</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">→</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">M</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">F</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">P</kbd>{" "}
        <kbd className="rounded border border-border bg-muted px-1">C</kbd>
      </p>
    </div>
  );
}



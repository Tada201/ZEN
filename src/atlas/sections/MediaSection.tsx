import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Play, Pause, Volume2, VolumeX, Music, Maximize, Minimize,
  PictureInPicture2, Captions, Gauge, SkipForward, SkipBack,
  Repeat, Shuffle, Search, Camera, CameraOff, Upload, X,
  Download, Share2, LayoutGrid, Rows3, Loader2,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Captions_ from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { DemoCard } from "../Section";
import { toast } from "sonner";

/* ─────────────────────────── helpers ─────────────────────────── */

const formatTime = (t: number) => {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/* ─────────────────────────── data ─────────────────────────── */

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

const PLAYLIST = [
  { title: "SoundHelix Demo 1", artist: "SoundHelix", src: "/media/audio.mp3" },
  { title: "SoundHelix Demo 2", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "SoundHelix Demo 3", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
];

const VIDEO_SRC = "/media/video.mp4";
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ─────────────────────────── Pro Video Player ─────────────────────────── */

function VideoPlayer() {
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
        className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-black focus:outline-none focus:ring-2 focus:ring-ring"
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
            <span className="rounded bg-black/70 px-3 py-1 text-xs font-medium text-white">
              [Demo caption — “C” to toggle]
            </span>
          </div>
        )}

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        )}

        {!playing && !loading && (
          <button
            onClick={togglePlay}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg backdrop-blur transition hover:scale-105">
              <Play className="ml-1 h-7 w-7" fill="currentColor" />
            </div>
          </button>
        )}

        {/* Bottom control bar */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 transition-opacity duration-200 ${
            showControls || !playing ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Progress + hover preview */}
          <div
            ref={progressRef}
            onClick={handleSeekClick}
            onMouseMove={handleSeekHover}
            onMouseLeave={() => setHoverPct(null)}
            className="group/seek relative h-1.5 w-full cursor-pointer rounded-full bg-white/20"
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered}%` }} />
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
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] text-white"
                style={{ left: hoverX }}
              >
                {formatTime(hoverPct * (duration || 0))}
              </div>
            )}
          </div>

          {/* Buttons row */}
          <div className="mt-2 flex items-center gap-1.5 text-white">
            <button onClick={togglePlay} aria-label="Play/Pause" className="press rounded-md p-1.5 hover:bg-white/10">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={() => seekBy(-10)} aria-label="Back 10s" className="press rounded-md p-1.5 hover:bg-white/10">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={() => seekBy(10)} aria-label="Forward 10s" className="press rounded-md p-1.5 hover:bg-white/10">
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
                className="press rounded-md p-1.5 hover:bg-white/10"
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
                  className="ml-2 h-1 w-16 appearance-none rounded-full bg-white/30 accent-primary"
                  aria-label="Volume"
                />
              </div>
            </div>

            <span className="ml-1 font-mono text-[11px] tabular-nums text-white/85">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              {/* Captions */}
              <button
                onClick={() => setCaptionsOn((c) => !c)}
                aria-label="Toggle captions"
                aria-pressed={captionsOn}
                className={`press rounded-md p-1.5 hover:bg-white/10 ${captionsOn ? "text-primary" : ""}`}
              >
                <Captions className="h-4 w-4" />
              </button>

              {/* Speed */}
              <div className="relative">
                <button
                  onClick={() => setShowRate((s) => !s)}
                  className="press flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium hover:bg-white/10"
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
                className={`press rounded-md p-1.5 hover:bg-white/10 ${pip ? "text-primary" : ""}`}
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                aria-label="Fullscreen"
                className="press rounded-md p-1.5 hover:bg-white/10"
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

/* ─────────────────────────── Pro Audio Player + Playlist ─────────────────────────── */

function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peaksRef = useRef<number[] | null>(null);
  const rafRef = useRef(0);

  const [trackIdx, setTrackIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const track = PLAYLIST[trackIdx];

  // Generate fake static peaks (decoding remote files for accurate peaks is heavy / CORS).
  // Visual peaks change per-track via a deterministic seed.
  useEffect(() => {
    const seed = trackIdx * 9301 + 49297;
    const rnd = (i: number) => {
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    const N = 96;
    peaksRef.current = Array.from({ length: N }, (_, i) => 0.25 + rnd(i) * 0.75);
  }, [trackIdx]);

  // Draw waveform: static peaks tinted by playback progress; live frequency bars on top.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const peaks = peaksRef.current;
      if (peaks) {
        const N = peaks.length;
        const bw = (w / N) * 0.7;
        const progress = duration ? currentTime / duration : 0;
        for (let i = 0; i < N; i++) {
          const barH = peaks[i] * h * 0.7;
          const x = (i / N) * w;
          const past = i / N <= progress;
          ctx.fillStyle = past ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.35)";
          ctx.fillRect(x, (h - barH) / 2, bw, barH);
        }
      }

      const analyser = analyserRef.current;
      if (analyser && playing) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const N = 48;
        const step = Math.floor(data.length / N);
        for (let i = 0; i < N; i++) {
          const value = data[i * step];
          const barH = (value / 255) * h * 0.5;
          const x = (i / N) * w + 1;
          ctx.fillStyle = `hsl(var(--primary) / 0.45)`;
          ctx.fillRect(x, (h - barH) / 2, (w / N) * 0.4, barH);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, currentTime, duration]);

  const ensureCtx = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    } catch { /* CORS or duplicate source — visualizer just stays static */ }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureCtx();
    audioCtxRef.current?.resume();
    if (audio.paused) { audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  }, [ensureCtx]);

  const next = useCallback(() => {
    setTrackIdx((i) => {
      if (shuffle) {
        let n = i;
        while (n === i && PLAYLIST.length > 1) n = Math.floor(Math.random() * PLAYLIST.length);
        return n;
      }
      return (i + 1) % PLAYLIST.length;
    });
    setPlaying(true);
  }, [shuffle]);

  const prev = useCallback(() => {
    setTrackIdx((i) => (i - 1 + PLAYLIST.length) % PLAYLIST.length);
    setPlaying(true);
  }, []);

  // Auto-play when track changes (after first user interaction)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIdx]);

  const seekWaveform = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-3">
      <audio
        ref={audioRef}
        src={track.src}
        crossOrigin="anonymous"
        loop={loop}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          const a = e.currentTarget;
          a.volume = volume;
        }}
        onEnded={() => { if (!loop) next(); else setPlaying(true); }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:scale-105"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{track.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {track.artist} · {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <Music className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Waveform */}
      <canvas
        ref={canvasRef}
        width={420}
        height={56}
        onClick={seekWaveform}
        className="w-full cursor-pointer rounded-lg border border-border"
      />

      {/* Transport */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShuffle((s) => !s)}
            aria-pressed={shuffle}
            className={`press rounded-md p-1.5 hover:bg-muted ${shuffle ? "text-primary" : "text-muted-foreground"}`}
            aria-label="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button onClick={prev} className="press rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={next} className="press rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next">
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            onClick={() => setLoop((l) => !l)}
            aria-pressed={loop}
            className={`press rounded-md p-1.5 hover:bg-muted ${loop ? "text-primary" : "text-muted-foreground"}`}
            aria-label="Loop"
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              if (audioRef.current) audioRef.current.volume = v;
            }}
            className="h-1 w-20 appearance-none rounded-full bg-muted accent-primary"
            aria-label="Volume"
          />
        </div>
      </div>

      {/* Playlist */}
      <ul className="space-y-1 border-t border-border pt-2">
        {PLAYLIST.map((t, i) => (
          <li key={t.src}>
            <button
              onClick={() => setTrackIdx(i)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted ${
                i === trackIdx ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${i === trackIdx && playing ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="flex-1 truncate">{t.title}</span>
              <span className="text-[10px] opacity-60">{t.artist}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── Enhanced Image Gallery ─────────────────────────── */

function ImageGallery() {
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

/* ─────────────────────────── Webcam Tile ─────────────────────────── */

function WebcamTile() {
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

/* ─────────────────────────── Drop Zone Tile ─────────────────────────── */

type DroppedFile = { name: string; size: number; type: string; url: string };

function DropZoneTile() {
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

/* ─────────────────────────── Compare Slider ─────────────────────────── */

function CompareSlider() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const update = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const x = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      update(x);
    };
    const stop = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", stop);
    };
  }, []);

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

/* ─────────────────────────── Section ─────────────────────────── */

export function MediaSection() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in-view")),
      { threshold: 0.08 }
    );
    el.querySelectorAll(".reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section id="media" ref={ref} className="scroll-mt-20 py-16" style={{ contentVisibility: "auto" }}>
      <header className="reveal mb-10 border-l-2 border-primary pl-5">
        <h2 className="gradient-text text-4xl font-bold tracking-tight md:text-5xl">Media</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Pro-grade video, audio, gallery, capture, upload, and compare components — all with real playback.
        </p>
      </header>

      {/* Featured row: large video on the left, two stacked tiles on the right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DemoCard
          label="Video · Pro"
          selection={{
            id: "m-video", name: "Video Player", category: "Media",
            variants: ["drag-seek", "hover-preview", "shortcuts", "PiP", "fullscreen", "speed", "captions", "buffer"],
            jsx: '<video onTimeUpdate onProgress /><HoverPreview /><Shortcuts />',
          }}
          className="lg:col-span-2 lg:row-span-2"
        >
          <VideoPlayer />
        </DemoCard>

        <DemoCard
          label="Audio · Playlist"
          selection={{
            id: "m-audio", name: "Audio Player + Playlist", category: "Media",
            variants: ["waveform", "click-to-seek", "queue", "loop", "shuffle", "volume"],
            jsx: '<AudioPlayer playlist={tracks} />',
          }}
        >
          <AudioPlayer />
        </DemoCard>

        <DemoCard
          label="Compare"
          selection={{
            id: "m-compare", name: "Before/After Slider", category: "Media",
            variants: ["drag", "keyboard", "touch"],
            jsx: '<CompareSlider before={a} after={b} />',
          }}
        >
          <CompareSlider />
        </DemoCard>
      </div>

      {/* Secondary row of tiles */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DemoCard
          label="Gallery"
          selection={{
            id: "m-lightbox", name: "Image Gallery + Lightbox", category: "Media",
            variants: ["search", "tags", "masonry", "slideshow", "share", "download"],
            jsx: '<Lightbox plugins={[Thumbnails, Zoom, Slideshow, Captions]} />',
          }}
        >
          <ImageGallery />
        </DemoCard>

        <DemoCard
          label="Webcam"
          selection={{
            id: "m-webcam", name: "Webcam Capture", category: "Media",
            variants: ["live-preview", "snapshot", "permissions"],
            jsx: 'navigator.mediaDevices.getUserMedia({ video: true })',
          }}
        >
          <WebcamTile />
        </DemoCard>

        <DemoCard
          label="Upload"
          selection={{
            id: "m-drop", name: "Drag & Drop Upload", category: "Media",
            variants: ["drop", "click", "preview", "remove"],
            jsx: '<input type="file" multiple accept="image/*,video/*,audio/*" />',
          }}
        >
          <DropZoneTile />
        </DemoCard>
      </div>
    </section>
  );
}

export default MediaSection;


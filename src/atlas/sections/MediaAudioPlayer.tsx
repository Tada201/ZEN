import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";

const formatTime = (t: number) => {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};
const PLAYLIST = [
  { title: "SoundHelix Demo 1", artist: "SoundHelix", src: "/media/audio.mp3" },
  { title: "SoundHelix Demo 2", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "SoundHelix Demo 3", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
];

export function AudioPlayer() {
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
  const [waveformVisible, setWaveformVisible] = useState(false);

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
      if (!waveformVisible || document.hidden) {
        rafRef.current = 0;
        return;
      }

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
      if (playing) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = 0;
      }
    };
    const start = () => {
      if (rafRef.current === 0 && waveformVisible && !document.hidden) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    start();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [playing, currentTime, duration, waveformVisible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting;
      setWaveformVisible(visible);
      if (!visible && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

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


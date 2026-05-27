import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Html } from "@react-three/drei";
import { AlertTriangle, Loader2 } from "lucide-react";

let WEBGL_SUPPORT_CACHE: boolean | null = null;

function detectWebGL(): boolean {
  if (WEBGL_SUPPORT_CACHE !== null) return WEBGL_SUPPORT_CACHE;
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    const ok = !!(gl && typeof gl.getParameter === "function");
    if (gl) {
      const lose = (gl as any).getExtension?.("WEBGL_lose_context");
      lose?.loseContext?.();
    }
    WEBGL_SUPPORT_CACHE = ok;
    return ok;
  } catch {
    WEBGL_SUPPORT_CACHE = false;
    return false;
  }
}

function WebGLUnavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
      <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
      <div className="text-xs font-medium">3D scene unavailable</div>
      <p className="max-w-[260px] text-[11px] text-muted-foreground">{reason}</p>
    </div>
  );
}

class CanvasErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[3D Lab] canvas failed to render", error.message);
    }
  }

  render() {
    if (this.state.error) {
      return <WebGLUnavailable reason="Your browser couldn't render this WebGL scene. Try refreshing or enabling hardware acceleration." />;
    }
    return this.props.children;
  }
}

export function LazyCanvas({ children, className, fallbackLabel }: { children: ReactNode; className?: string; fallbackLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [webglOk] = useState(() => detectWebGL());

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!webglOk) {
    return (
      <div ref={ref} className={className}>
        <WebGLUnavailable reason="WebGL isn't available in this browser. Enable hardware acceleration to view 3D scenes." />
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      {active ? (
        <CanvasErrorBoundary>{children}</CanvasErrorBoundary>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {fallbackLabel ?? "Loading 3D scene..."}
        </div>
      )}
    </div>
  );
}

export function CanvasLoader() {
  return (
    <Html center>
      <div className="flex items-center gap-1.5 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading scene...
      </div>
    </Html>
  );
}

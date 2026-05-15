import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { Group, InstancedMesh, Mesh } from "three";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Box,
  Sphere,
  Torus,
  Float,
  Environment,
  ContactShadows,
  MeshDistortMaterial,
  PerspectiveCamera,
  Html,
  RoundedBox,
} from "@react-three/drei";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoCard, Section } from "../Section";

/* ───────────────────── Floating shapes ───────────────────── */

function RotatingCube({ wireframe, paused }: { wireframe: boolean; paused: boolean }) {
  const meshRef = useRef<Mesh | null>(null);
  useFrame((_, delta) => {
    if (paused || !meshRef.current) return;
    meshRef.current.rotation.x += delta * 0.5;
    meshRef.current.rotation.y += delta * 0.3;
  });
  return (
    <Box ref={meshRef} args={[1.5, 1.5, 1.5]}>
      <meshStandardMaterial color="hsl(265 85% 60%)" wireframe={wireframe} metalness={0.3} roughness={0.4} />
    </Box>
  );
}

function FloatingSphere({ paused }: { paused: boolean }) {
  const meshRef = useRef<Mesh | null>(null);
  useFrame((state) => {
    if (paused || !meshRef.current) return;
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.3;
  });
  return (
    <Sphere ref={meshRef} args={[0.8, 32, 32]} position={[2, 0, 0]}>
      <meshStandardMaterial color="hsl(199 89% 60%)" metalness={0.6} roughness={0.2} />
    </Sphere>
  );
}

function SpinningTorus({ paused }: { paused: boolean }) {
  const meshRef = useRef<Mesh | null>(null);
  useFrame((_, delta) => {
    if (paused || !meshRef.current) return;
    meshRef.current.rotation.x += delta * 0.2;
    meshRef.current.rotation.z += delta * 0.4;
  });
  return (
    <Torus ref={meshRef} args={[0.8, 0.25, 16, 64]} position={[-2, 0, 0]}>
      <meshStandardMaterial color="hsl(346 77% 60%)" metalness={0.4} roughness={0.3} />
    </Torus>
  );
}

function ScenePrimitives({ wireframe, paused, autoRotate }: { wireframe: boolean; paused: boolean; autoRotate: boolean }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, -2, -5]} intensity={0.4} color="hsl(265 85% 60%)" />
      <RotatingCube wireframe={wireframe} paused={paused} />
      <FloatingSphere paused={paused} />
      <SpinningTorus paused={paused} />
      <OrbitControls enableZoom={false} autoRotate={autoRotate} autoRotateSpeed={1} />
    </>
  );
}

/* ───────────────────── Material Studio ───────────────────── */

const MAT_PRESETS = [
  { label: "Brushed", color: "#a78bfa", metal: 0.85, rough: 0.35 },
  { label: "Glossy", color: "#22d3ee", metal: 0.2, rough: 0.05 },
  { label: "Matte", color: "#f59e0b", metal: 0.0, rough: 0.95 },
  { label: "Chrome", color: "#e2e8f0", metal: 1.0, rough: 0.05 },
];

function MaterialStudio({ idx }: { idx: number }) {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.25;
  });
  const preset = MAT_PRESETS[idx];
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#7c3aed" />
      <group ref={groupRef}>
        <RoundedBox args={[1.6, 1.6, 1.6]} radius={0.2} smoothness={6}>
          <meshStandardMaterial color={preset.color} metalness={preset.metal} roughness={preset.rough} />
        </RoundedBox>
        <Sphere args={[0.55, 64, 64]} position={[1.6, 0.4, 0.6]}>
          <meshStandardMaterial color={preset.color} metalness={preset.metal} roughness={preset.rough} />
        </Sphere>
        <Torus args={[0.5, 0.18, 24, 64]} position={[-1.5, 0.1, 0.6]} rotation={[Math.PI / 2.2, 0, 0]}>
          <meshStandardMaterial color={preset.color} metalness={preset.metal} roughness={preset.rough} />
        </Torus>
      </group>
      <ContactShadows position={[0, -1.05, 0]} opacity={0.45} scale={8} blur={2.6} far={3} />
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
      <PerspectiveCamera makeDefault position={[0, 1.4, 5]} fov={45} />
      <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 2} />
    </>
  );
}

/* ───────────────────── Distort blob ───────────────────── */

function DistortBlob({ speed, distort }: { speed: number; distort: number }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1.1} />
      <pointLight position={[-3, -3, 3]} intensity={0.6} color="#22d3ee" />
      <Float floatIntensity={1.2} rotationIntensity={1.6} speed={1.4}>
        <Sphere args={[1.2, 96, 96]}>
          {/* @ts-ignore drei material props */}
          <MeshDistortMaterial color="#a78bfa" distort={distort} speed={speed} roughness={0.15} metalness={0.4} />
        </Sphere>
      </Float>
      <ContactShadows position={[0, -1.4, 0]} opacity={0.35} blur={2} scale={6} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <OrbitControls enableZoom={false} enablePan={false} />
    </>
  );
}

/* ───────────────────── Particle field ───────────────────── */

function ParticleField({ count = 1500 }: { count?: number }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    const arr: { x: number; y: number; z: number; r: number; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      const r = 1.2 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        r,
        speed: 0.4 + Math.random() * 0.6,
      });
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    const m = meshRef.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const wobble = Math.sin(t * p.speed + i) * 0.08;
      dummy.position.set(p.x + wobble, p.y + Math.cos(t * p.speed + i) * 0.08, p.z);
      const s = 0.02 + Math.abs(Math.sin(t * 0.6 + i * 0.05)) * 0.02;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.rotation.y = t * 0.08;
    m.rotation.x = Math.sin(t * 0.15) * 0.2;
  });

  return (
    <>
      <color attach="background" args={["#070611"]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 3]} intensity={0.8} color="#a78bfa" />
      <pointLight position={[-3, -3, -3]} intensity={0.6} color="#22d3ee" />
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color="#e0e7ff" emissive="#7c3aed" emissiveIntensity={0.6} />
      </instancedMesh>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </>
  );
}

/* ───────────────────── Wave grid ───────────────────── */

function WaveGrid() {
  const ref = useRef<Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(6, 6, 60, 60), []);
  const original = useMemo(() => geo.attributes.position.array.slice(), [geo]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = (original as Float32Array)[i * 3];
      const y = (original as Float32Array)[i * 3 + 1];
      const z = Math.sin(x * 1.2 + t) * 0.25 + Math.cos(y * 1.2 + t * 0.8) * 0.25;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <mesh ref={ref} geometry={geo} rotation={[-Math.PI / 2.5, 0, 0]}>
        <meshStandardMaterial color="hsl(265 85% 60%)" wireframe metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh geometry={geo} rotation={[-Math.PI / 2.5, 0, 0]}>
        <meshStandardMaterial color="hsl(265 85% 60%)" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} />
    </>
  );
}

/* ───────────────────── WebGL error boundary + feature detection ───────────────────── */

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

/* ───────────────────── Lazy canvas mount ───────────────────── */

function LazyCanvas({ children, className, fallbackLabel }: { children: React.ReactNode; className?: string; fallbackLabel?: string }) {
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

  // Feature-detect FIRST so we never let three throw synchronously and trip Vite's overlay.
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
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {fallbackLabel ?? "Loading 3D scene…"}
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Loader fallback (R3F) ───────────────────── */

function CanvasLoader() {
  return (
    <Html center>
      <div className="flex items-center gap-1.5 rounded-md bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading scene…
      </div>
    </Html>
  );
}

/* ───────────────────── Section ───────────────────── */

export function Lab3DSection() {
  const [wireframe, setWireframe] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [matIdx, setMatIdx] = useState(0);
  const [distort, setDistort] = useState(0.45);
  const [particles, setParticles] = useState(1500);
  const [resetKey, setResetKey] = useState(0);

  return (
    <Section id="lab-3d" title="3D Lab" description="Interactive scenes built with React Three Fiber and drei.">
      <DemoCard
        label="Floating shapes"
        selection={{
          id: "3d-floating",
          name: "Floating Shapes",
          category: "3D Lab",
          variants: ["wireframe", "paused", "auto-rotate"],
          jsx: `<Canvas>\n  <Box /> <Sphere /> <Torus />\n  <OrbitControls autoRotate />\n</Canvas>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <LazyCanvas className="relative h-72 overflow-hidden rounded-lg border border-border bg-gradient-to-b from-muted/50 to-muted">
            <Canvas key={`p-${resetKey}`} dpr={[1, 1.6]} camera={{ position: [0, 0, 5], fov: 50 }}>
              <Suspense fallback={<CanvasLoader />}>
                <ScenePrimitives wireframe={wireframe} paused={paused} autoRotate={autoRotate} />
              </Suspense>
            </Canvas>
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-card/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
              react-three-fiber · drei
            </div>
          </LazyCanvas>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={wireframe ? "default" : "outline"} className="press" onClick={() => setWireframe((v) => !v)}>
              Wireframe
            </Button>
            <Button size="sm" variant={paused ? "default" : "outline"} className="press" onClick={() => setPaused((v) => !v)}>
              {paused ? "Play" : "Pause"}
            </Button>
            <Button size="sm" variant={autoRotate ? "default" : "outline"} className="press" onClick={() => setAutoRotate((v) => !v)}>
              Auto-rotate
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">Drag to orbit</span>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Material studio"
        selection={{
          id: "3d-mat",
          name: "Material Presets",
          category: "3D Lab",
          variants: MAT_PRESETS.map((p) => p.label),
          jsx: `<meshStandardMaterial metalness={${MAT_PRESETS[matIdx].metal}} roughness={${MAT_PRESETS[matIdx].rough}} />`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <LazyCanvas className="relative h-72 overflow-hidden rounded-lg border border-border bg-gradient-to-b from-slate-900 to-slate-800">
            <Canvas key={`m-${resetKey}`} dpr={[1, 1.6]} shadows>
              <Suspense fallback={<CanvasLoader />}>
                <MaterialStudio idx={matIdx} />
              </Suspense>
            </Canvas>
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
              {MAT_PRESETS[matIdx].label} · m {MAT_PRESETS[matIdx].metal} · r {MAT_PRESETS[matIdx].rough}
            </div>
          </LazyCanvas>
          <div className="flex flex-wrap gap-1.5">
            {MAT_PRESETS.map((p, i) => (
              <Button
                key={p.label}
                size="sm"
                variant={i === matIdx ? "default" : "outline"}
                className="press h-7 px-2.5 text-[11px]"
                onClick={() => setMatIdx(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Distort blob"
        selection={{
          id: "3d-distort",
          name: "Distort Material",
          category: "3D Lab",
          variants: ["distort", "speed"],
          jsx: `<Float><Sphere>\n  <MeshDistortMaterial distort={${distort.toFixed(2)}} speed={3} />\n</Sphere></Float>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <LazyCanvas className="relative h-72 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900">
            <Canvas key={`d-${resetKey}`} dpr={[1, 1.6]} camera={{ position: [0, 0, 4.2], fov: 45 }}>
              <Suspense fallback={<CanvasLoader />}>
                <DistortBlob distort={distort} speed={3} />
              </Suspense>
            </Canvas>
            <div className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
              <Sparkles className="h-3 w-3" /> distort
            </div>
          </LazyCanvas>
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-muted-foreground" htmlFor="distort-range">
              Distort
            </label>
            <input
              id="distort-range"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={distort}
              onChange={(e) => setDistort(parseFloat(e.target.value))}
              className="h-1 flex-1 appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{distort.toFixed(2)}</span>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Particle field"
        selection={{
          id: "3d-particles",
          name: "Instanced Particles",
          category: "3D Lab",
          variants: ["instanced", "GPU"],
          jsx: `<instancedMesh args={[null, null, ${particles}]}>\n  <sphereGeometry args={[1, 8, 8]} />\n</instancedMesh>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <LazyCanvas className="relative h-72 overflow-hidden rounded-lg border border-border bg-[#070611]">
            <Canvas key={`pt-${resetKey}-${particles}`} dpr={[1, 1.6]} camera={{ position: [0, 0, 6], fov: 45 }}>
              <Suspense fallback={<CanvasLoader />}>
                <ParticleField count={particles} />
              </Suspense>
            </Canvas>
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
              {particles.toLocaleString()} instances
            </div>
          </LazyCanvas>
          <div className="flex flex-wrap items-center gap-2">
            {[500, 1500, 3500].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={particles === n ? "default" : "outline"}
                className="press h-7 px-2.5 text-[11px]"
                onClick={() => setParticles(n)}
              >
                {n.toLocaleString()}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="press ml-auto h-7 px-2 text-[11px]"
              onClick={() => setResetKey((k) => k + 1)}
            >
              <RefreshCw className="h-3 w-3" /> Reset
            </Button>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Wave grid"
        selection={{
          id: "3d-wave",
          name: "Procedural Wave Grid",
          category: "3D Lab",
          variants: ["vertex animation", "wireframe"],
          jsx: `<mesh geometry={planeGeo}>\n  <meshStandardMaterial wireframe />\n</mesh>\n// updates positions per frame`,
        }}
        className="md:col-span-2 xl:col-span-3"
      >
        <div onClick={(e) => e.stopPropagation()}>
          <LazyCanvas className="relative h-72 overflow-hidden rounded-lg border border-border bg-gradient-to-b from-background via-muted/40 to-muted">
            <Canvas key={`w-${resetKey}`} dpr={[1, 1.6]} camera={{ position: [0, 2, 5], fov: 45 }}>
              <Suspense fallback={<CanvasLoader />}>
                <WaveGrid />
              </Suspense>
            </Canvas>
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-card/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
              60 × 60 vertex grid · sin(x) + cos(y)
            </div>
          </LazyCanvas>
        </div>
      </DemoCard>
    </Section>
  );
}

export default Lab3DSection;

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useAnimationsEnabled } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Welcome black-hole background.
 *
 * Bundled Three.js scene recreating the black-hole welcome animation from the
 * prior standalone HTML (rings, camera-facing lensed disk, event horizon,
 * particles, label) WITHOUT the external CDN script — Three is already a
 * project dependency, so CSP/offline/version drift are avoided.
 *
 * Lifecycle / performance contract:
 * - Renders a static frame when motion is disabled and animates only while the
 *   app's canonical `animationsEnabled` policy is on (no OS media-query, no
 *   second preference).
 * - Pauses when the document is hidden or the stage is offscreen
 *   (visibilitychange + IntersectionObserver), and disposes every WebGL
 *   resource on unmount.
 * - FPS cap: 30 by default, 15 when a constrained-power signal is detected
 *   (battery discharging low OR navigator.connection.saveData). Never
 *   requires the battery API — falls back to 30 when the signal is absent.
 * - Pixel ratio is capped at 1.0 in normal and power-save modes to limit
 *   full-viewport fill cost without changing the scene geometry.
 * - Non-interactive (pointer-events-none, aria-hidden) so the welcome
 *   workspace picker / composer stay fully usable.
 */

const FPS_TARGET = 30;
const FPS_POWER_SAVE = 15;
const FALLBACK_FPS_TARGET = 30;
const FALLBACK_FPS_POWER_SAVE = 15;
const MAX_PIXEL_RATIO = 1;
const POWER_SAVE_PIXEL_RATIO = 1;
  // 1.8x the previous welcome-scene scale; the composer remains in front.
const BLACK_HOLE_SCALE = 1.8;

interface BatteryLike {
  charging: boolean | null;
  level: number | null;
}

/** Progressive power constraint heuristic. Never blocks init on unsupported APIs. */
async function detectConstrainedPower(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery === "function") {
      const battery = await nav.getBattery();
      if (battery.charging === false && battery.level !== null && battery.level <= 0.2) return true;
    }
  } catch {
    /* battery API unavailable — not an error */
  }
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;
    if (conn?.saveData === true) return true;
  } catch {
    /* connection API unavailable — not an error */
  }
  return false;
}

interface BuildResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  render: () => void;
  animate: (dt: number, elapsed: number) => void;
  dispose: () => void;
  resize: (w: number, h: number) => void;
}

const WELCOME_COLOR = 0xffffff;

function buildScene(
  stageWidth: number,
  stageHeight: number,
  canvas: HTMLCanvasElement,
  pixelRatio: number,
): BuildResult {
  const scene = new THREE.Scene();
  scene.background = null; // CSS provides the page background; canvas is translucent

  const camera = new THREE.PerspectiveCamera(38, stageWidth / stageHeight, 0.1, 100);
  camera.position.set(0, 5.6 / BLACK_HOLE_SCALE, 4.4 / BLACK_HOLE_SCALE);
  camera.lookAt(0, 0, 0);

  const context =
    canvas.getContext("webgl2", { antialias: true, alpha: true }) ??
    canvas.getContext("webgl", { antialias: true, alpha: true });
  if (!context || context.isContextLost() || !context.getContextAttributes()) {
    throw new Error("WebGL context unavailable or already lost");
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    // This is a decorative background; disabling MSAA avoids a second full-
    // viewport multisample cost in WebView2.
    antialias: false,
    alpha: true,
  });
  renderer.setSize(stageWidth, stageHeight);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  // The scene is centered; a small scissor margin avoids spending fill-rate
  // on only the extreme transparent margins while keeping the enlarged scene
  // inside the render region.
  const setRenderBounds = (w: number, h: number) => {
    // Keep a 7% safety margin: it contains the enlarged scene while avoiding
    // the near-full-viewport fill cost of a 2% margin.
    const marginX = w * 0.07;
    const marginY = h * 0.07;
    renderer.setScissor(marginX, marginY, w - marginX * 2, h - marginY * 2);
  };
  renderer.setScissorTest(true);
  setRenderBounds(stageWidth, stageHeight);

  // --- disk group (shared tilt for every ring + particle) ---
  const disk = new THREE.Group();
  disk.rotation.x = -0.55;
  disk.rotation.z = 0.18;
  scene.add(disk);

  const ringRadii = [1.15, 1.4, 1.65, 1.9, 2.15, 2.4, 2.65];
  const ringOpacities = [0.95, 0.78, 0.62, 0.48, 0.35, 0.24, 0.16];

  const disposables: Array<{ dispose: () => void }> = [];

  const createRing = (radius: number, opacity: number) => {
    const points: THREE.Vector3[] = [];
    const segments = 320;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: WELCOME_COLOR,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: true,
    });
    disposables.push(geo, mat);
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 0;
    return line;
  };

  ringRadii.forEach((r, i) => disk.add(createRing(r, ringOpacities[i])));

  const coreRadius = 0.55;

  // gravitational-lens image in camera-facing coordinates (see the warning in
  // the original scene): the vertical lens is a camera-space image of the disk
  const lensTune = {
    liftExponent: 3.35,
    bulgeScale: 1.6,
    midSpread: 0.5,
    midExponent: 0.8,
    outerScale: 1.0,
    outerExponent: 2.0,
    intersectionSmoothness: 1.0,
    leftAnchor: 1.025,
    rightAnchor: 1.048,
    verticalOffset: -0.15,
    alignment: 0.2,
  };

  function getProjectedDiskAnchor(diskRadius: number): number {
    const diskNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(disk.quaternion).normalize();
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward).normalize();
    // Project both tips of the real disk through the camera and intersect with
    // the lens plane to keep the tips glued to the visible disk geometry.
    const lineOfNodes = new THREE.Vector3().crossVectors(diskNormal, cameraForward).normalize();
    const worldPoint = lineOfNodes.multiplyScalar(diskRadius);
    const projected = worldPoint.clone().project(camera);
    const rayPoint = new THREE.Vector3(projected.x, projected.y, 0.5).unproject(camera);
    const rayDirection = rayPoint.sub(camera.position).normalize();
    const planeNormal = cameraForward.clone();
    const planePoint = lens.position.clone();
    const denom = rayDirection.dot(planeNormal);
    if (Math.abs(denom) < 1e-6) return 1.0;
    const distance = planePoint.clone().sub(camera.position).dot(planeNormal) / denom;
    const hit = camera.position.clone().add(rayDirection.multiplyScalar(distance));
    return Math.abs(
      hit
        .clone()
        .sub(lens.position)
        .applyQuaternion(lens.quaternion.clone().invert()).x,
    );
  }

  const makeLensedCurve = (radius: number, bulge: number, width: number, opacity: number, diskAnchorRadius: number) => {
    const points: THREE.Vector3[] = [];
    const projectedAnchor = getProjectedDiskAnchor(diskAnchorRadius) / radius;
    const leftEquatorAnchor = projectedAnchor * lensTune.leftAnchor;
    const rightEquatorAnchor = projectedAnchor * lensTune.rightAnchor;
    const segments = 720;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const a = Math.abs(s);
      const lensFactor = Math.pow(a, lensTune.liftExponent);
      const lift = 1.0 + bulge * lensTune.bulgeScale * lensFactor;
      const equatorBlend = Math.pow(1.0 - a, lensTune.intersectionSmoothness);
      const midBulge = lensTune.midSpread * Math.pow(a, lensTune.midExponent);
      const outerBulge = width * lensTune.outerScale * Math.pow(a, lensTune.outerExponent);
      const sideAnchor = c < 0 ? leftEquatorAnchor : rightEquatorAnchor;
      const sideWidth = sideAnchor * equatorBlend + (1 + midBulge + outerBulge) * (1 - equatorBlend);
      points.push(new THREE.Vector3(radius * c * sideWidth, radius * s * lift, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: WELCOME_COLOR,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    });
    disposables.push(geo, mat);
    return new THREE.Line(geo, mat);
  };

  const lens = new THREE.Group();
  lens.position.set(0, lensTune.verticalOffset, 0);
  lens.rotation.z = lensTune.alignment;
  scene.add(lens);
  lens.quaternion.copy(camera.quaternion);

  const lensRings = [
    { r: 0.67, bulge: 0.12, width: 0.22, opacity: 0.78, anchorRadius: 1.15 },
    { r: 0.79, bulge: 0.16, width: 0.27, opacity: 0.64, anchorRadius: 1.4 },
    { r: 0.91, bulge: 0.21, width: 0.32, opacity: 0.5, anchorRadius: 1.65 },
    { r: 1.03, bulge: 0.26, width: 0.37, opacity: 0.38, anchorRadius: 1.9 },
  ];

  let lensLines: THREE.Line[] = [];
  let lensMasks: THREE.Mesh[] = [];

  const makeOcclusionSurface = (outerLine: THREE.Line) => {
    const attr = outerLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const count = attr.count;
    const positions = new Float32Array(count * 3);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count - 1; i++) {
      cx += attr.getX(i);
      cy += attr.getY(i);
    }
    cx /= count - 1;
    cy /= count - 1;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = attr.getX(i);
      positions[i * 3 + 1] = attr.getY(i);
      positions[i * 3 + 2] = -0.004;
    }
    const centerIndex = count;
    const fullPositions = new Float32Array((count + 1) * 3);
    fullPositions.set(positions);
    fullPositions[centerIndex * 3] = cx;
    fullPositions[centerIndex * 3 + 1] = cy;
    fullPositions[centerIndex * 3 + 2] = -0.004;
    const indices: number[] = [];
    for (let i = 0; i < count - 1; i++) indices.push(centerIndex, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(fullPositions, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0c,
      side: THREE.DoubleSide,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });
    disposables.push(geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    return mesh;
  };

  function rebuildLens() {
    lensLines.forEach((line) => {
      lens.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    lensMasks.forEach((mask) => {
      lens.remove(mask);
      mask.geometry.dispose();
      (mask.material as THREE.Material).dispose();
    });
    lensMasks = [];
    lensLines = lensRings.map((l) =>
      makeLensedCurve(l.r, l.bulge, l.width, l.opacity, l.anchorRadius),
    );
    const surface = makeOcclusionSurface(lensLines[lensLines.length - 1]);
    lensMasks.push(surface);
    lens.add(surface);
    lensLines.forEach((line) => {
      line.renderOrder = 2;
      lens.add(line);
    });
    lens.position.y = lensTune.verticalOffset;
    lens.rotation.z = lensTune.alignment;
  }
  rebuildLens();

  // event horizon core
  const coreGeo = new THREE.SphereGeometry(coreRadius, 48, 48);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
  disposables.push(coreGeo, coreMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.renderOrder = 3;
  scene.add(core);

  // silhouette outline
  const outlinePoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const t = (i / 128) * Math.PI * 2;
    outlinePoints.push(new THREE.Vector3(Math.cos(t) * coreRadius, Math.sin(t) * coreRadius, 0));
  }
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
  const outlineMat = new THREE.LineBasicMaterial({ color: WELCOME_COLOR, transparent: true, opacity: 0.9 });
  disposables.push(outlineGeo, outlineMat);
  const coreOutline = new THREE.Line(outlineGeo, outlineMat);
  coreOutline.renderOrder = 4;
  scene.add(coreOutline);

  // particles: Keplerian speeds, inner faster
  const particleGroups: Array<{ mesh: THREE.Mesh; radius: number; speed: number; angle: number }> = [];
  ringRadii.forEach((r, i) => {
    const count = i === 0 ? 3 : 2;
    const baseSpeed = 0.9 / Math.pow(r, 1.5);
    for (let j = 0; j < count; j++) {
      const pGeo = new THREE.SphereGeometry(0.028 - i * 0.003, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({
        color: WELCOME_COLOR,
        transparent: true,
        opacity: Math.min(1, ringOpacities[i] + 0.15),
      });
      disposables.push(pGeo, pMat);
      const mesh = new THREE.Mesh(pGeo, pMat);
      const angleOffset = (j / count) * Math.PI * 2 + i * 0.7;
      disk.add(mesh);
      particleGroups.push({ mesh, radius: r, speed: baseSpeed, angle: angleOffset });
    }
  });

  // Z label sprite (camera-facing canvas texture)
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 256;
  const ctx = labelCanvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 140px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", 128, 138);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  disposables.push(labelTexture);
  const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
  disposables.push(labelMaterial);
  const label = new THREE.Sprite(labelMaterial);
  label.scale.set(0.7, 0.7, 1);
  label.renderOrder = 5;
  scene.add(label);

  const animate = (dt: number, elapsed: number) => {
    void elapsed;
    particleGroups.forEach((p) => {
      p.angle += p.speed * dt;
      p.mesh.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
    });
    coreOutline.quaternion.copy(camera.quaternion);
    lens.quaternion.copy(camera.quaternion);
    lens.rotation.z = lensTune.alignment;
    lens.position.y = lensTune.verticalOffset;
  };

  const render = () => renderer.render(scene, camera);

  const resize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    setRenderBounds(w, h);
  };

  const dispose = () => {
    particleGroups.forEach((p) => {
      disk.remove(p.mesh);
    });

    // Do not remove children while Object3D.traverse is iterating its live
    // children array; mutating it makes Three attempt to traverse an undefined
    // sibling during React effect cleanup.
    const objects: THREE.Object3D[] = [];
    scene.traverse((obj) => objects.push(obj));
    objects.reverse().forEach((obj) => obj.removeFromParent());

    disposables.forEach((d) => d.dispose());
    // renderer.dispose() releases Three.js resources. Do not explicitly lose
    // the WebGL context here: React StrictMode runs effect cleanup/setup twice
    // in development, and a lost context cannot be reused by the second setup.
    renderer.dispose();
  };

  return { scene, camera, renderer, render, animate, resize, dispose };
}

function drawCanvasFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
) {
  const centerX = width / 2;
  const centerY = height * 0.52;
  const scale = Math.min(width / 7.2, height / 4.8) * BLACK_HOLE_SCALE;
  const ringRadii = [1.15, 1.4, 1.65, 1.9, 2.15, 2.4, 2.65];
  const ringOpacities = [0.95, 0.78, 0.62, 0.48, 0.35, 0.24, 0.16];
  const lensRings = [
    { r: 0.67, bulge: 0.12, width: 0.22, opacity: 0.78 },
    { r: 0.79, bulge: 0.16, width: 0.27, opacity: 0.64 },
    { r: 0.91, bulge: 0.21, width: 0.32, opacity: 0.5 },
    { r: 1.03, bulge: 0.26, width: 0.37, opacity: 0.38 },
  ];

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.lineCap = "round";

  // Main tilted accretion disk. This is the 2D fallback for WebViews that
  // expose a canvas but cannot create a usable WebGL context.
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(0.18);
  ringRadii.forEach((radius, index) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * scale * 1.34, radius * scale * 0.4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${ringOpacities[index]})`;
    ctx.stroke();

    const count = index === 0 ? 3 : 2;
    const speed = 0.9 / Math.pow(radius, 1.5);
    for (let particle = 0; particle < count; particle += 1) {
      const angle = (particle / count) * Math.PI * 2 + index * 0.7 + speed * elapsed;
      const x = Math.cos(angle) * radius * scale * 1.34;
      const y = Math.sin(angle) * radius * scale * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, scale * 0.028 - index * scale * 0.003), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, ringOpacities[index] + 0.15)})`;
      ctx.fill();
    }
  });
  ctx.restore();

  const lensPoints = (radius: number, bulge: number, lineWidth: number) => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= 240; i += 1) {
      const t = (i / 240) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const a = Math.abs(s);
      const lift = 1 + bulge * 1.6 * Math.pow(a, 3.35);
      const equatorBlend = 1 - a;
      const midBulge = 0.5 * Math.pow(a, 0.8);
      const outerBulge = lineWidth * Math.pow(a, 2);
      const sideAnchor = c < 0 ? 1.025 : 1.048;
      const sideWidth = sideAnchor * equatorBlend + (1 + midBulge + outerBulge) * (1 - equatorBlend);
      points.push([
        radius * c * sideWidth * scale * 1.15,
        radius * s * lift * scale * 0.82,
      ]);
    }
    return points;
  };

  ctx.save();
  ctx.translate(centerX, centerY - scale * 0.15);
  ctx.rotate(0.2);
  const outerLens = lensPoints(lensRings[lensRings.length - 1].r, lensRings[lensRings.length - 1].bulge, lensRings[lensRings.length - 1].width);
  ctx.beginPath();
  outerLens.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(10, 10, 12, 0.96)";
  ctx.fill();

  lensRings.forEach((ring) => {
    const points = lensPoints(ring.r, ring.bulge, ring.width);
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = `rgba(255, 255, 255, ${ring.opacity})`;
    ctx.stroke();
  });
  ctx.restore();

  const coreRadius = scale * 0.55;
  ctx.beginPath();
  ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0c";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.max(42, scale * 0.7)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", centerX, centerY + 2);
  ctx.restore();
}

/**
 * Purely decorative background. Uses a static frame when animations are
 * disabled and pauses animated frames when the document is hidden or the
 * stage leaves the viewport.
 */
export function WelcomeBlackHoleBackground({
  className,
  paused = false,
}: {
  className?: string;
  paused?: boolean;
}) {
  const animationsEnabled = useAnimationsEnabled();
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animationsEnabled && !reducedMotion;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Start optimistically and fall back only after the actual mounted canvas
  // fails. Probing a second temporary WebGL canvas wastes a context and can
  // trigger context limits in embedded WebViews.
  const [webglOk, setWebglOk] = useState(true);
  const [powerSave, setPowerSave] = useState(false);
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void detectConstrainedPower().then((c) => {
      if (!cancelled) setPowerSave(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!webglOk) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const build = (() => {
      try {
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          powerSave ? POWER_SAVE_PIXEL_RATIO : MAX_PIXEL_RATIO,
        );
        return buildScene(host.clientWidth || 1, host.clientHeight || 1, canvas, pixelRatio);
      } catch (error) {
        console.error("[WelcomeBlackHoleBackground] Failed to initialize WebGL scene:", error);
        setWebglOk(false);
        setInitError(true);
        return null;
      }
    })();
    if (!build) return;

    const { render, animate, dispose, resize } = build;

    // power-aware frame pacing
    const stepMs = () => 1000 / (powerSave ? FPS_POWER_SAVE : FPS_TARGET);
    let running = false;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let elapsed = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!running) return;
      if (pausedRef.current) {
        last = now;
        acc = 0;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1); // clamp long sleeps
      last = now;
      acc += dt * 1000;
      const renderStepMs = stepMs();
      if (acc >= renderStepMs) {
        const renderInterval = acc / 1000;
        acc -= renderStepMs;
        elapsed += renderInterval;
        animate(renderInterval, elapsed);
        render();
      }
    };

    const start = () => {
      if (!shouldAnimate) {
        render();
        return;
      }
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // resize with a debounce frame — ResizeObserver fires rapidly on toggles
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resize(host.clientWidth, host.clientHeight);
        if (!shouldAnimate) render();
      });
    });
    resizeObserver.observe(host);

    // hide when offscreen or tab hidden
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(host);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      cancelAnimationFrame(resizeRaf);
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      dispose();
    };
  }, [powerSave, shouldAnimate, webglOk]);

  const fallbackMode = !webglOk || initError;
  useEffect(() => {
    if (!fallbackMode) return;
    const host = hostRef.current;
    const canvas = fallbackCanvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let elapsed = 0;
    let raf = 0;
    let running = false;
    let last = performance.now();
    let acc = 0;

    const resize = () => {
      width = host.clientWidth || window.innerWidth;
      height = host.clientHeight || window.innerHeight;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        powerSave ? POWER_SAVE_PIXEL_RATIO : MAX_PIXEL_RATIO,
      );
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCanvasFallback(ctx, width, height, elapsed);
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt * 1000;
      if (acc >= 1000 / (powerSave ? FALLBACK_FPS_POWER_SAVE : FALLBACK_FPS_TARGET)) {
        acc = 0;
        elapsed += dt;
        drawCanvasFallback(ctx, width, height, elapsed);
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      if (shouldAnimate) raf = requestAnimationFrame(tick);
      else drawCanvasFallback(ctx, width, height, elapsed);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(host);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fallbackMode, powerSave, shouldAnimate]);

  if (fallbackMode) {
    return (
      <div
        ref={hostRef}
        className={cn("pointer-events-none absolute inset-0 z-0 h-full w-full overflow-hidden", className)}
        aria-hidden="true"
      >
        <canvas ref={fallbackCanvasRef} className="block h-full w-full" />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn("pointer-events-none absolute inset-0 z-0 h-full w-full overflow-hidden", className)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

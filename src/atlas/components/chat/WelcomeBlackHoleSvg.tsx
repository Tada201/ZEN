import { motion } from "framer-motion";
import { useAnimationsEnabled } from "@/lib/motion";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_VIEWPORT = { width: 1600, height: 900 };
const CAMERA_POSITION = { x: 0, y: 5.6, z: 4.4 };
const CAMERA_TARGET = { x: 0, y: 0, z: 0 };
const CAMERA_FOV_DEGREES = 38;
const DISK_ROTATION_X = -0.55;
const DISK_ROTATION_Z = 0.18;
const LENS_ALIGNMENT = 0.2;
const LENS_POSITION = { x: 0, y: -0.15, z: 0 };
// The SVG welcome scene is intentionally 1.5x smaller than its former 1.5x
// enlargement so the workspace/composer remain visually dominant.
const BLACK_HOLE_SCALE = 1;
// Keep the low-quality mode visibly alive without animating every outer ring.
const SVG_OUTER_PARTICLE_COUNT = 1;

const ringRadii = [1.15, 1.4, 1.65, 1.9, 2.15, 2.4, 2.65];
const ringOpacities = [0.95, 0.78, 0.62, 0.48, 0.35, 0.24, 0.16];
const lensRings = [
  { radius: 0.67, bulge: 0.12, width: 0.22, opacity: 0.78, anchorRadius: 1.15 },
  { radius: 0.79, bulge: 0.16, width: 0.27, opacity: 0.64, anchorRadius: 1.4 },
  { radius: 0.91, bulge: 0.21, width: 0.32, opacity: 0.5, anchorRadius: 1.65 },
  { radius: 1.03, bulge: 0.26, width: 0.37, opacity: 0.38, anchorRadius: 1.9 },
];

type Vec3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number };
type ProjectedPath = {
  renderPath: string;
  motionPath: string;
  motionId: string;
  start: ScreenPoint;
};
type ProjectedScene = {
  diskPaths: ProjectedPath[];
  diskOpacities: number[];
  lensPaths: string[];
  outerLensPath: string;
  core: { center: ScreenPoint; radiusX: number; radiusY: number };
};

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function multiply(a: Vec3, scalar: number): Vec3 {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return multiply(vector, 1 / length);
}

/** Three.js Euler XYZ rotation used by the sample's tilted disk group. */
function rotateDiskPoint(point: Vec3): Vec3 {
  const cosX = Math.cos(DISK_ROTATION_X);
  const sinX = Math.sin(DISK_ROTATION_X);
  const afterX = {
    x: point.x,
    y: point.y * cosX - point.z * sinX,
    z: point.y * sinX + point.z * cosX,
  };
  const cosZ = Math.cos(DISK_ROTATION_Z);
  const sinZ = Math.sin(DISK_ROTATION_Z);
  return {
    x: afterX.x * cosZ - afterX.y * sinZ,
    y: afterX.x * sinZ + afterX.y * cosZ,
    z: afterX.z,
  };
}

function makeCamera(viewportWidth: number, viewportHeight: number) {
  const position = CAMERA_POSITION;
  const forward = normalize(subtract(CAMERA_TARGET, position));
  // This is the camera's world-space right and up basis for lookAt(0, 0, 0).
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  const tanHalfFov = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);

  const project = (worldPoint: Vec3): ScreenPoint => {
    const relative = subtract(worldPoint, position);
    const depth = dot(relative, forward);
    const ndcX = dot(relative, right) / (depth * tanHalfFov * aspect);
    const ndcY = dot(relative, up) / (depth * tanHalfFov);
    const x = viewportWidth * (0.5 + ndcX * 0.5);
    const y = viewportHeight * (0.5 - ndcY * 0.5);
    // Bake the enlargement into projected coordinates instead of applying a
    // transform to the whole animated SVG. This preserves the 1.5x visual
    // size while avoiding an extra large SVG transform/compositing layer.
    return {
      x: viewportWidth / 2 + (x - viewportWidth / 2) * BLACK_HOLE_SCALE,
      y: viewportHeight / 2 + (y - viewportHeight / 2) * BLACK_HOLE_SCALE,
    };
  };

  const cameraFacingPoint = (localX: number, localY: number): Vec3 => {
    const cos = Math.cos(LENS_ALIGNMENT);
    const sin = Math.sin(LENS_ALIGNMENT);
    const alignedX = localX * cos - localY * sin;
    const alignedY = localX * sin + localY * cos;
    return add(LENS_POSITION, add(multiply(right, alignedX), multiply(up, alignedY)));
  };

  return { forward, right, up, project, cameraFacingPoint };
}

function makePath(points: ScreenPoint[], motionId: string): ProjectedPath {
  const first = points[0];
  const renderCommands = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  const motionCommands = points.map((point, index) => {
    const x = point.x - first.x;
    const y = point.y - first.y;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return {
    renderPath: `${renderCommands.join(" ")} Z`,
    motionPath: `${motionCommands.join(" ")} Z`,
    motionId,
    start: first,
  };
}

function makeDiskPath(radius: number, camera: ReturnType<typeof makeCamera>, index: number) {
  const points: ScreenPoint[] = [];
  const segments = 144;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(camera.project(rotateDiskPoint({
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
    })));
  }
  return makePath(points, `welcome-disk-motion-${index}`);
}

function getProjectedDiskAnchor(
  diskRadius: number,
  camera: ReturnType<typeof makeCamera>,
) {
  const diskNormal = rotateDiskPoint({ x: 0, y: 1, z: 0 });
  const lineOfNodes = normalize(cross(diskNormal, camera.forward));
  const worldPoint = multiply(lineOfNodes, diskRadius);
  const ray = normalize(subtract(worldPoint, CAMERA_POSITION));
  const denominator = dot(ray, camera.forward);
  if (Math.abs(denominator) < 1e-6) return 1;
  const distance = dot(subtract(LENS_POSITION, CAMERA_POSITION), camera.forward) / denominator;
  const hit = add(CAMERA_POSITION, multiply(ray, distance));
  return Math.abs(dot(subtract(hit, LENS_POSITION), camera.right));
}

function makeLensPath(
  radius: number,
  bulge: number,
  width: number,
  anchorRadius: number,
  camera: ReturnType<typeof makeCamera>,
) {
  const points: ScreenPoint[] = [];
  const projectedAnchor = getProjectedDiskAnchor(anchorRadius, camera) / radius;
  const leftEquatorAnchor = projectedAnchor * 1.025;
  const rightEquatorAnchor = projectedAnchor * 1.048;
  const segments = 180;

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const a = Math.abs(s);
    const lift = 1 + bulge * 1.6 * Math.pow(a, 3.35);
    const equatorBlend = 1 - a;
    const midBulge = 0.5 * Math.pow(a, 0.8);
    const outerBulge = width * Math.pow(a, 2);
    const sideAnchor = c < 0 ? leftEquatorAnchor : rightEquatorAnchor;
    const sideWidth = sideAnchor * equatorBlend + (1 + midBulge + outerBulge) * (1 - equatorBlend);
    points.push(camera.project(camera.cameraFacingPoint(radius * c * sideWidth, radius * s * lift)));
  }

  return makePath(points, "welcome-lens-path").renderPath;
}

function buildProjectedScene(viewportWidth: number, viewportHeight: number): ProjectedScene {
  const camera = makeCamera(viewportWidth, viewportHeight);
  const diskPaths = ringRadii.map((radius, index) => makeDiskPath(radius, camera, index));
  const lensPaths = lensRings.map((ring) =>
    makeLensPath(ring.radius, ring.bulge, ring.width, ring.anchorRadius, camera),
  );
  const coreCenter = camera.project({ x: 0, y: 0, z: 0 });
  const coreRight = camera.project({ x: 0.55 * camera.right.x, y: 0.55 * camera.right.y, z: 0.55 * camera.right.z });
  const coreUp = camera.project({ x: 0.55 * camera.up.x, y: 0.55 * camera.up.y, z: 0.55 * camera.up.z });

  return {
    diskPaths,
    diskOpacities: ringOpacities,
    lensPaths,
    outerLensPath: lensPaths[lensPaths.length - 1],
    core: {
      center: coreCenter,
      radiusX: Math.abs(coreRight.x - coreCenter.x),
      radiusY: Math.abs(coreUp.y - coreCenter.y),
    },
  };
}

export function WelcomeBlackHoleSvg({
  className,
  paused = false,
  draw = false,
}: {
  className?: string;
  paused?: boolean;
  draw?: boolean;
}) {
  const animationsEnabled = useAnimationsEnabled();
  const settingsHydrated = useSettingsStore((state) => state.isHydrated);
  const reducedMotion = useReducedMotion();
  const shouldAnimate = settingsHydrated && animationsEnabled && !reducedMotion;
  const shouldDraw = draw && shouldAnimate && !paused;
  // Normalized pathLength lets every orbit draw at its own physical speed
  // while the complete black-hole illustration finishes in three seconds.
  const drawTransition = { duration: 3, ease: "linear" as const };
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const scene = useMemo(() => buildProjectedScene(viewport.width, viewport.height), [viewport]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const width = Math.max(1, Math.round(svg.clientWidth));
      const height = Math.max(1, Math.round(svg.clientHeight));
      setViewport((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={svgRef}
      className={className ?? "pointer-events-none absolute inset-0 z-0 h-full w-full"}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="none"
      shapeRendering="optimizeSpeed"
      role="presentation"
      aria-hidden="true"
    >
      {/* Geometry is projected from the same camera as the Three.js sample.
          Motion stays continuous; discrete 30-step SVG keyframes caused the
          particles to jump visibly between positions. */}
      <defs>
        {/* Reuse one parsed motion path per ring instead of embedding a full
            path string in every animated particle. */}
        {scene.diskPaths.map((path) => (
          <path key={path.motionId} id={path.motionId} d={path.motionPath} />
        ))}
      </defs>

      <g fill="none" stroke="#fff" strokeWidth="1">
        {scene.diskPaths.map((path, index) => (
          <motion.path
            key={ringRadii[index]}
            d={path.renderPath}
            pathLength={1}
            initial={draw ? { pathLength: 0, opacity: 0 } : false}
            animate={
              draw && !settingsHydrated
                ? { pathLength: 0, opacity: 0 }
                : { pathLength: 1, opacity: scene.diskOpacities[index] }
            }
            transition={shouldDraw ? drawTransition : { duration: 0 }}
          />
        ))}

        {scene.diskPaths.map((path, index) => {
          const count = index === 0 ? 3 : SVG_OUTER_PARTICLE_COUNT;
          const speed = 0.9 / Math.pow(ringRadii[index], 1.5);
          const duration = (Math.PI * 2) / speed;
          return Array.from({ length: count }, (_, particleIndex) => {
            const offset = (particleIndex / count) * duration;
            return (
              <circle
                key={`${ringRadii[index]}-${particleIndex}`}
                cx={path.start.x}
                cy={path.start.y}
                r={Math.max(2, 4 - index * 0.35)}
                fill="#fff"
                stroke="none"
                opacity={Math.min(1, scene.diskOpacities[index] + 0.15)}
              >
                {shouldAnimate && !paused && (
                  <animateMotion
                    begin={`-${offset}s`}
                    dur={`${duration}s`}
                    repeatCount="indefinite"
                  >
                    <mpath href={`#${path.motionId}`} />
                  </animateMotion>
                )}
              </circle>
            );
          });
        })}
      </g>

      {/* The dark camera-space surface prevents the horizontal disk leaking through. */}
      <path d={scene.outerLensPath} fill="#0a0a0c" stroke="none" opacity="0.96" />
      <g fill="none" stroke="#fff" strokeWidth="1.1">
        {scene.lensPaths.map((path, index) => (
          <motion.path
            key={lensRings[index].radius}
            d={path}
            pathLength={1}
            initial={draw ? { pathLength: 0, opacity: 0 } : false}
            animate={
              draw && !settingsHydrated
                ? { pathLength: 0, opacity: 0 }
                : { pathLength: 1, opacity: lensRings[index].opacity }
            }
            transition={shouldDraw ? drawTransition : { duration: 0 }}
          />
        ))}
      </g>

      <motion.ellipse
        cx={scene.core.center.x}
        cy={scene.core.center.y}
        rx={scene.core.radiusX}
        ry={scene.core.radiusY}
        pathLength={1}
        fill="#0a0a0c"
        stroke="#fff"
        strokeWidth="1"
        initial={draw ? { pathLength: 0, opacity: 0 } : false}
        animate={
          draw && !settingsHydrated
            ? { pathLength: 0, opacity: 0 }
            : { pathLength: 1, opacity: 0.98 }
        }
        transition={shouldDraw ? drawTransition : { duration: 0 }}
      />
    </svg>
  );
}

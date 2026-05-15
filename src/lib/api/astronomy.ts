import { invoke } from '@tauri-apps/api/core';

/**
 * Star data from HYG catalog
 */
export interface Star {
  id: number;
  name?: string;
  ra: number;  // Right Ascension in degrees (0-360)
  dec: number; // Declination in degrees (-90 to 90)
  distance: number; // Parsecs
  magnitude: number; // Visual magnitude
  colorIndex: number; // B-V color index (-0.4 to 2.0)
  properMotionRa?: number; // mas/year
  properMotionDec?: number; // mas/year
}

/**
 * Planet/Moon position data
 */
export interface Planet {
  name: string;
  ra: number; // Right Ascension (degrees)
  dec: number; // Declination (degrees)
  magnitude: number; // Visual magnitude (brightness)
  distanceAu: number; // Distance in AU
  radiusKm: number; // Physical radius
  objectType: 'planet' | 'moon' | 'asteroid' | 'comet';
}

/**
 * Satellite orbital data
 */
export interface Satellite {
  name: string;
  tleLine1: string; // Two-Line Element line 1
  tleLine2: string; // Two-Line Element line 2
  epoch: string; // TLE epoch
  altitudeKm: number; // Current altitude above Earth
  inclination: number; // Orbital inclination in degrees
}

/**
 * Deep sky objects (galaxies, nebulae, star clusters)
 */
export interface DeepSkyObject {
  messierId?: string; // M31, M42, etc.
  ngcId?: string; // NGC catalog number
  name: string; // Common name
  ra: number; // Right Ascension (degrees)
  dec: number; // Declination (degrees)
  magnitude: number; // Visual magnitude
  objectType: 'galaxy' | 'nebula' | 'cluster';
  sizeArcmin: number; // Angular size in arcminutes
}

/**
 * Astronomy system status
 */
export interface AstronomyStatus {
  stars: {
    loaded: boolean;
    count: number;
    source: string;
  };
  planets: {
    loaded: boolean;
    count: number;
    source: string;
  };
  satellites: {
    loaded: boolean;
    count: number;
    source: string;
  };
  deepsky: {
    loaded: boolean;
    count: number;
    source: string;
  };
}

/**
 * 3D Cartesian coordinates (for rendering)
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Altitude/Azimuth coordinates (horizon frame)
 */
export interface HorizonCoordinates {
  altitude: number; // Degrees above horizon (0 = horizon, 90 = zenith)
  azimuth: number; // Compass direction (0 = North, 90 = East, 180 = South, 270 = West)
  visible: boolean; // Is object above horizon?
}

/**
 * Observer location on Earth
 */
export interface ObserverLocation {
  latitude: number; // Degrees (-90 to 90, N positive)
  longitude: number; // Degrees (-180 to 180, E positive)
  altitude: number; // Meters above sea level
  timezone: string; // IANA timezone (e.g., "America/New_York")
}

/**
 * Sky snapshot at a specific time/location
 */
export interface SkySnapshot {
  timestamp: string; // ISO8601
  observer: ObserverLocation;
  visibleStars: Star[];
  visiblePlanets: Planet[];
  visibleSatellites: Satellite[];
  visibleDeepSky: DeepSkyObject[];
}

/**
 * Convert RA/Dec to 3D Cartesian coordinates
 */
export function raDecToXyz(ra: number, dec: number, dist: number): Vec3 {
  // Validate inputs to prevent NaN in Three.js
  if (
    ra === undefined || ra === null || isNaN(ra) ||
    dec === undefined || dec === null || isNaN(dec) ||
    dist === undefined || dist === null || isNaN(dist) ||
    !isFinite(ra) || !isFinite(dec) || !isFinite(dist)
  ) {
    console.warn(`[Astronomy] Invalid coordinates: RA=${ra}, Dec=${dec}, Dist=${dist}. Falling back to origin.`);
    return { x: 0, y: 0, z: 0 };
  }

  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  return {
    x: dist * Math.cos(decRad) * Math.cos(raRad),
    y: dist * Math.sin(decRad),
    z: dist * Math.cos(decRad) * Math.sin(raRad),
  };
}

/**
 * Convert 3D Cartesian to RA/Dec
 */
export function xyzToRaDec(x: number, y: number, z: number): { ra: number; dec: number; distance: number } {
  const distance = Math.sqrt(x * x + y * y + z * z);

  if (distance === 0) {
    return { ra: 0, dec: 0, distance: 0 };
  }

  const ra = (Math.atan2(x, z) * 180) / Math.PI;
  const dec = (Math.asin(y / distance) * 180) / Math.PI;

  return {
    ra: normalizeAngle(ra),
    dec: Math.max(-90, Math.min(90, dec)),
    distance,
  };
}

/**
 * Normalize angle to 0-360 degrees
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Get star color from color index (B-V)
 * Returns hex color string
 */
export function colorIndexToHex(ci: number | null): string {
  if (ci === null) return '#FFFFFF';

  if (ci < -0.3) return '#9FBFFF'; // O (Deep Blue)
  if (ci < 0.0) return '#AFCFFF'; // B (Blue-White)
  if (ci < 0.3) return '#FFFFFF'; // A (White)
  if (ci < 0.6) return '#FFF4EA'; // F (Yellow-White)
  if (ci < 0.9) return '#FFF2A1'; // G (Yellow - like Sun)
  if (ci < 1.4) return '#FFCC6F'; // K (Orange)
  return '#FF6060'; // M (Red)
}

/**
 * Get brightness scaling for star rendering
 * Based on apparent magnitude
 */
export function magnitudeToSize(magnitude: number): number {
  // Brighter stars (lower magnitude) appear larger
  // Formula: size = (6 - magnitude) * scale
  // Magnitude 0 = 6.0, Magnitude 6 = 0.0
  return Math.max(0.1, (6 - magnitude) * 0.5);
}

/**
 * Fetch all stars from backend
 */
export async function getStars(): Promise<Star[]> {
  try {
    return await invoke<Star[]>('get_stars');
  } catch (error) {
    console.error('Failed to fetch stars:', error);
    return [];
  }
}

/**
 * Fetch all planets from backend
 */
export async function getPlanets(): Promise<Planet[]> {
  try {
    return await invoke<Planet[]>('get_planets');
  } catch (error) {
    console.error('Failed to fetch planets:', error);
    return [];
  }
}

/**
 * Fetch all satellites from backend
 */
export async function getAstronomicalSatellites(): Promise<Satellite[]> {
  try {
    return await invoke<Satellite[]>('get_astronomical_satellites');
  } catch (error) {
    console.error('Failed to fetch satellites:', error);
    return [];
  }
}

/**
 * Fetch all deep sky objects from backend
 */
export async function getDeepSkyObjects(): Promise<DeepSkyObject[]> {
  try {
    return await invoke<DeepSkyObject[]>('get_deepsky_objects');
  } catch (error) {
    console.error('Failed to fetch deep sky objects:', error);
    return [];
  }
}

/**
 * Fetch astronomy system status
 */
export async function getAstronomyStatus(): Promise<AstronomyStatus> {
  try {
    return await invoke<AstronomyStatus>('get_astronomy_status');
  } catch (error) {
    console.error('Failed to fetch astronomy status:', error);
    return {
      stars: { loaded: false, count: 0, source: 'N/A' },
      planets: { loaded: false, count: 0, source: 'N/A' },
      satellites: { loaded: false, count: 0, source: 'N/A' },
      deepsky: { loaded: false, count: 0, source: 'N/A' },
    };
  }
}

/**
 * Magnitude to actual brightness ratio
 * Each magnitude difference = 2.512x brightness change
 */
export function magnitudeToBrightness(magnitude: number): number {
  return Math.pow(2.512, -magnitude);
}

/**
 * Parallax (arcseconds) to distance (parsecs)
 */
export function parallaxToDistance(parallaxArcSec: number): number {
  return parallaxArcSec > 0 ? 1 / parallaxArcSec : Infinity;
}

/**
 * Distance (parsecs) to parallax (arcseconds)
 */
export function distanceToParallax(distancePc: number): number {
  return distancePc > 0 ? 1 / distancePc : 0;
}

/**
 * Filter stars by various criteria
 */
export function filterStars(
  stars: Star[],
  options: {
    maxMagnitude?: number;
    maxDistance?: number;
    name?: string;
  }
): Star[] {
  return stars.filter((star) => {
    if (options.maxMagnitude !== undefined && star.magnitude > options.maxMagnitude) {
      return false;
    }
    if (options.maxDistance !== undefined && star.distance > options.maxDistance) {
      return false;
    }
    if (options.name !== undefined && !star.name?.toLowerCase().includes(options.name.toLowerCase())) {
      return false;
    }
    return true;
  });
}

/**
 * Sort stars by various criteria
 */
export function sortStars(
  stars: Star[],
  by: 'magnitude' | 'distance' | 'brightness' | 'name'
): Star[] {
  const sorted = [...stars];

  switch (by) {
    case 'magnitude':
      return sorted.sort((a, b) => a.magnitude - b.magnitude);
    case 'distance':
      return sorted.sort((a, b) => a.distance - b.distance);
    case 'brightness':
      return sorted.sort(
        (a, b) => magnitudeToBrightness(b.magnitude) - magnitudeToBrightness(a.magnitude)
      );
    case 'name':
      return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    default:
      return sorted;
  }
}

/**
 * Find stars near a specific RA/Dec
 */
export function findStarsNear(
  stars: Star[],
  ra: number,
  dec: number,
  radiusDegrees: number
): Star[] {
  return stars.filter((star) => {
    // Simple distance check (good enough for nearby stars)
    const dRa = Math.abs(star.ra - ra);
    const dDec = Math.abs(star.dec - dec);
    // Account for RA wrapping at 0/360
    const actualDRa = Math.min(dRa, 360 - dRa);
    return actualDRa < radiusDegrees && dDec < radiusDegrees;
  });
}
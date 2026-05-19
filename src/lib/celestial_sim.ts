// Approximate orbital periods in Earth days
const ORBITAL_PERIODS: Record<string, number> = {
    Mercury: 87.97,
    Venus: 224.70,
    Earth: 365.26,
    Mars: 686.98,
    Jupiter: 4332.59,
    Saturn: 10759.22,
    Uranus: 30688.5,
    Neptune: 60182.0,
};

// Semi-major axes in million km
const ORBIT_RADIUS: Record<string, number> = {
    Mercury: 57.9,
    Venus: 108.2,
    Earth: 149.6,
    Mars: 227.9,
    Jupiter: 778.6,
    Saturn: 1433.5,
    Uranus: 2872.5,
    Neptune: 4495.1,
};

// Reference epoch J2000 (Jan 1, 2000, 12:00 UTC)
const J2000 = new Date('2000-01-01T12:00:00Z').getTime();

export interface PlanetPosition {
    name: string;
    x: number; // million km
    y: number; // million km
    z: number; // million km (simplified to ecliptic plane)
    radius: number;
    color: string;
}

const PLANET_COLORS: Record<string, string> = {
    Sun: '#FFD700',
    Mercury: '#A5A5A5',
    Venus: '#E3BB76',
    Earth: '#007FFF',
    Mars: '#FF4500',
    Jupiter: '#D39C7E',
    Saturn: '#C5AB6E',
    Uranus: '#BBE1E4',
    Neptune: '#6081FF',
};

export function getPlanetPositions(date: Date = new Date()): PlanetPosition[] {
    const now = date.getTime();
    const daysSinceEpoch = (now - J2000) / (1000 * 60 * 60 * 24);

    return Object.keys(ORBIT_RADIUS).map((name) => {
        const radius = ORBIT_RADIUS[name];
        const period = ORBITAL_PERIODS[name];

        // Simplified circular orbit
        // Using arbitrary initial phase for visual distribution
        const initialPhase = (radius * 1337) % (2 * Math.PI);
        const angularVelocity = (2 * Math.PI) / period;
        const currentAngle = initialPhase + (angularVelocity * daysSinceEpoch);

        return {
            name,
            x: radius * Math.cos(currentAngle),
            y: radius * Math.sin(currentAngle),
            z: 0.1 * radius * Math.sin(currentAngle * 0.5), // Subtle incline
            radius,
            color: PLANET_COLORS[name] || '#FFFFFF',
        };
    });
}

export function getOrbitPath(planetName: string, segments: number = 100): number[][] {
    const radius = ORBIT_RADIUS[planetName];
    if (!radius) return [];

    const points: number[][] = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        // Match the initial phase logic if possible, but static circles are fine for UI
        points.push([
            radius * Math.cos(angle),
            radius * Math.sin(angle),
            0.1 * radius * Math.sin(angle * 0.5) // Mirror matching incline
        ]);
    }
    return points;
}

import * as Cesium from 'cesium';

const issSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 10 L 4 4 L 10 4" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 28 10 L 28 4 L 22 4" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 4 22 L 4 28 L 10 28" fill="none" stroke="cyan" stroke-width="2" />
  <path d="M 28 22 L 28 28 L 22 28" fill="none" stroke="cyan" stroke-width="2" />
  <circle cx="16" cy="16" r="4" fill="none" stroke="cyan" stroke-width="2" />
  <circle cx="16" cy="16" r="2" fill="cyan" />
</svg>`;

const boatSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 2 12 L 22 12 L 18 20 L 6 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
</svg>`;

const cargoSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 2 14 L 22 14 L 20 20 L 4 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
  <rect x="6" y="10" width="12" height="4" fill="none" stroke="cyan" stroke-width="1.5"/>
</svg>`;

const fishingSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 14 L 20 14 L 17 20 L 7 20 Z" fill="none" stroke="cyan" stroke-width="1.5"/>
  <line x1="12" y1="14" x2="12" y2="6" stroke="cyan" stroke-width="1.5"/>
</svg>`;

const svgToDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

export const issIconUrl = svgToDataUrl(issSvg);
const boatIconUrl = svgToDataUrl(boatSvg);
const cargoIconUrl = svgToDataUrl(cargoSvg);
const fishingIconUrl = svgToDataUrl(fishingSvg);

export const getVesselStyle = (type?: string) => {
    switch (type?.toLowerCase()) {
        case 'cargo':
            return { icon: cargoIconUrl, color: Cesium.Color.fromCssColorString('#00FF9F') };
        case 'tanker':
            return { icon: cargoIconUrl, color: Cesium.Color.fromCssColorString('#FFCC00') };
        case 'fishing':
            return { icon: fishingIconUrl, color: Cesium.Color.fromCssColorString('#FF00FF') };
        case 'passenger':
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#FFFFFF') };
        case 'military':
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#FF2266') };
        default:
            return { icon: boatIconUrl, color: Cesium.Color.fromCssColorString('#00CCFF') };
    }
};

export const altitudeToColor = (alt?: number): string => {
    if (alt === undefined || alt <= 0) return "#22c55e";
    if (alt < 3000) return "#06b6d4";
    if (alt < 8000) return "#3b82f6";
    if (alt < 12000) return "#8b5cf6";
    return "#ec4899";
};

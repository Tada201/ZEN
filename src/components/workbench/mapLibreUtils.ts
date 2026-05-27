// Custom style generator for high-performance offline-first raster tiles.
export const getMapStyle = (provider: 'dark' | 'satellite' | 'google-3d' | 'off') => {
    let tiles = ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'];
    let attribution = '&copy; <a href="https://carto.com/">CARTO</a>';

    if (provider === 'satellite' || provider === 'google-3d') {
        tiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
        attribution = '&copy; ESRI World Imagery';
    } else if (provider === 'off') {
        tiles = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='];
        attribution = 'VOID DIGITAL';
    }

    return {
        version: 8,
        sources: {
            'raster-tiles': {
                type: 'raster',
                tiles,
                tileSize: 256,
                attribution,
            }
        },
        layers: [
            {
                id: 'base-tiles',
                type: 'raster',
                source: 'raster-tiles',
                minzoom: 0,
                maxzoom: 20,
            }
        ]
    } as any;
};

// Polyline decoding helper for routing.
export function decodePolyline(str: string, precision = 5): [number, number][] {
    let index = 0,
        lat = 0,
        lng = 0,
        coordinates: [number, number][] = [],
        shift = 0,
        result = 0,
        byte = null,
        latitudeChange,
        longitudeChange,
        factor = Math.pow(10, precision);

    while (index < str.length) {
        byte = null;
        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        latitudeChange = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += latitudeChange;

        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        longitudeChange = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += longitudeChange;

        coordinates.push([lng / factor, lat / factor]);
    }
    return coordinates;
}

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';

export interface WeatherPoint {
  lat: number;
  lon: number;
  temperature: number;
  wind_speed: number;
  wind_direction: number;
  humidity: number;
  precipitation: number;
  cloud_cover: number;
  weather_code: number;
  description: string;
}

function tempToHex(temp: number): string {
  if (temp <= -20) return '#1e3a5f';
  if (temp <= -10) return '#2563eb';
  if (temp <= 0) return '#06b6d4';
  if (temp <= 10) return '#22d3ee';
  if (temp <= 15) return '#10b981';
  if (temp <= 20) return '#84cc16';
  if (temp <= 25) return '#eab308';
  if (temp <= 30) return '#f97316';
  if (temp <= 35) return '#ef4444';
  if (temp <= 40) return '#dc2626';
  return '#991b1b';
}

function wmoToShort(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}

interface WeatherHeatmapOverlayProps {
  className?: string;
  viewportWeather?: WeatherPoint | null;
}

const WeatherHeatmapOverlay: React.FC<WeatherHeatmapOverlayProps> = ({
  className,
  viewportWeather = null,
}) => {
  return (
    <div className={cn(
      'absolute inset-0 pointer-events-none overflow-hidden',
      className
    )}>
      {/* Temperature gradient overlay */}
      {viewportWeather && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${tempToHex(viewportWeather.temperature)}33 0%, transparent 50%)`,
          }}
        />
      )}
    </div>
  );
};

export { WeatherHeatmapOverlay, tempToHex, wmoToShort };
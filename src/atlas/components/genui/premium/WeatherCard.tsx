import { Droplets, Thermometer, Wind } from 'lucide-react';

export function WeatherCard({ data }: { data: any }) {
  const location = data.location || data.city || 'Unknown';
  const temp = data.temperature ?? data.temp;
  const condition = data.condition || data.description || 'Clear';
  const humidity = data.humidity;
  const windSpeed = data.windSpeed || data.wind_speed || data.wind;
  const feelsLike = data.feelsLike || data.feels_like;
  const icon = data.icon || '☀️';
  const high = data.high ?? data.temp_max;
  const low = data.low ?? data.temp_min;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg w-full max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-white text-sm">{location}</h4>
          <p className="text-xs text-white/40 mt-0.5">{condition}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-4xl font-black text-white tracking-tighter">
          {temp != null ? `${temp}°` : '--'}
        </span>
        {high != null && low != null && (
          <span className="text-xs text-white/40 ml-2">
            H:{high}° L:{low}°
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
        {feelsLike != null && (
          <div className="flex items-center gap-1.5">
            <Thermometer size={12} className="text-white/30 shrink-0" />
            <span className="text-[10px] text-white/50">Feels {feelsLike}°</span>
          </div>
        )}
        {humidity != null && (
          <div className="flex items-center gap-1.5">
            <Droplets size={12} className="text-white/30 shrink-0" />
            <span className="text-[10px] text-white/50">{humidity}%</span>
          </div>
        )}
        {windSpeed != null && (
          <div className="flex items-center gap-1.5">
            <Wind size={12} className="text-white/30 shrink-0" />
            <span className="text-[10px] text-white/50">{windSpeed}</span>
          </div>
        )}
      </div>
      {(data.forecast && Array.isArray(data.forecast)) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06] overflow-x-auto">
          {data.forecast.slice(0, 5).map((day: any, i: number) => (
            <div key={i} className="flex flex-col items-center shrink-0 px-2">
              <span className="text-[9px] text-white/30 uppercase">{day.day || day.date || ''}</span>
              <span className="text-sm mt-0.5">{day.icon || '☀️'}</span>
              <span className="text-[10px] text-white/60 mt-0.5">
                {day.high ?? day.temp}{day.low ? `/${day.low}` : ''}°
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { Globe } from "lucide-react";

export function WeatherCard({ location, temp, condition, high, low, forecast = [] }: any) {
  return (
    <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-card to-muted/20 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{location}</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tighter">{temp}°</span>
            <span className="text-sm font-medium text-muted-foreground">{condition}</span>
          </div>
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Globe className="h-6 w-6 text-primary" />
        </div>
      </div>
      {(high !== undefined || low !== undefined) && (
        <div className="flex gap-4 text-xs font-medium text-muted-foreground border-t border-border/40 pt-4">
          <span>H: {high}°</span>
          <span>L: {low}°</span>
        </div>
      )}
      {forecast.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-border/40">
          {forecast.map((f: any, i: number) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase">{f.day}</span>
              <span className="text-xs font-bold">{f.temp}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

export function MapComponent({ 
  latitude = 0, 
  longitude = 0, 
  className 
}: { 
  latitude?: number; 
  longitude?: number; 
  zoom?: number; 
  label?: string;
  className?: string;
}) {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude-0.01}%2C${latitude-0.01}%2C${longitude+0.01}%2C${latitude+0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  
  return (
    <div className={cn("relative w-full aspect-video rounded-xl overflow-hidden border border-border/50 shadow-sm", className)}>
      <iframe
        title="Map"
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight={0}
        marginWidth={0}
        src={mapUrl}
        className="grayscale-[0.2] contrast-[1.1]"
      />
      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-border/50 text-[9px] text-muted-foreground font-medium">
        © OpenStreetMap
      </div>
    </div>
  );
}

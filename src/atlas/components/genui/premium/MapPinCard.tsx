import { MapPin, Phone, Clock, Star } from "lucide-react";
import { MapComponent } from "../Map";

interface MapPinData {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  rating?: number | string;
  hours?: string;
  phone?: string;
}

export function MapPinCard({ data }: { data: MapPinData }) {
  const name = data.name || "Location";
  const address = data.address || "";
  const lat = data.lat ?? 0;
  const lng = data.lng ?? 0;
  const category = data.category || "Place";
  const rating = data.rating;
  const hours = data.hours;
  const phone = data.phone;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg">
      <div className="w-full h-36 relative border-b border-white/[0.08]">
        <MapComponent
          latitude={lat}
          longitude={lng}
          label={name}
          className="w-full h-full"
        />
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div>
            <span className="text-[9px] uppercase font-mono tracking-widest text-primary/70">{category}</span>
            <h3 className="text-sm font-semibold text-white mt-0.5">{name}</h3>
          </div>
          {rating && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold shrink-0">
              <Star className="w-2.5 h-2.5 fill-current" />
              <span>{rating}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 text-[11px] text-white/60 mb-3.5 leading-relaxed">
          <MapPin className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
          <span>{address}</span>
        </div>

        {(hours || phone) && (
          <div className="space-y-1.5 pt-3 border-t border-white/[0.06] text-[10px] text-white/40 font-mono">
            {hours && (
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-white/30" />
                <span>{hours}</span>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3 h-3 text-white/30" />
                <span className="text-white/60">{phone}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

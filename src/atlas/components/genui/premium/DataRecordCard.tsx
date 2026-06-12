import { User } from 'lucide-react';

export function DataRecordCard({ data }: { data: any }) {
  const title = data.title || data.name || 'Record';
  const subtitle = data.subtitle || data.role || '';
  const avatar = data.avatar || data.image || '';
  const fields = data.fields || data.rows || {};

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg w-full max-w-md">
      <div className="flex items-center gap-3 mb-4">
        {avatar ? (
          <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <User size={16} className="text-white/30" />
          </div>
        )}
        <div className="min-w-0">
          <h4 className="font-semibold text-white text-sm truncate">{title}</h4>
          {subtitle && <p className="text-[11px] text-white/40 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2 border-t border-white/[0.06] pt-3">
        {Object.entries(fields).map(([key, value]) => (
          <div key={key} className="flex justify-between items-baseline gap-3">
            <span className="text-[10px] text-white/40 uppercase tracking-wider shrink-0">{key}</span>
            <span className="text-[11px] text-white/80 text-right truncate font-medium">
              {String(value ?? '—')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

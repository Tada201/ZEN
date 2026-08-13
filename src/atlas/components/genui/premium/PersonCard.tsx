import { User } from "lucide-react";

export function PersonCard({ data }: { data: any }) {
  return (
    <div className="genui-card-surface flex w-full max-w-none min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-lg sm:flex-row sm:items-center">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/10 text-2xl font-black text-primary shadow-inner">
        {data.avatar ? (
          <img
            src={data.avatar}
            alt={data.name || ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <User size={28} />
        )}
        <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border border-border bg-emerald-500" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h4 className="truncate font-bold tracking-tight text-primary-foreground">
              {data.name || "John Doe"}
            </h4>
            <p className="text-xs font-medium text-primary-foreground">
              {data.role || "Principal Investigator"}
            </p>
          </div>
          <p className="text-[10px] font-mono text-primary">
            {data.organization || "Aegis Division"}
          </p>
        </div>

        {(data.email || data.phone) && (
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-3 text-xs text-primary-foreground sm:grid-cols-2">
            {data.email && (
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">Email</span>
                <span className="truncate font-mono">{data.email}</span>
              </div>
            )}
            {data.phone && (
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">Phone</span>
                <span className="truncate font-mono">{data.phone}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

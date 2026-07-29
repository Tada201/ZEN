import { CheckCircle2, Circle } from "lucide-react";

interface TimelineEvent {
  date: string;
  label: string;
  description?: string;
  status?: "done" | "active" | "upcoming" | string;
}

interface TimelineData {
  title: string;
  events: TimelineEvent[];
}

export function TimelineCard({ data }: { data: TimelineData }) {
  const title = data.title || "Timeline";
  const events = data.events || [];

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
      <h3 className="text-sm font-semibold text-primary-foreground mb-4 tracking-tight">{title}</h3>

      <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-1.5 before:h-[calc(100%-14px)] before:w-px before:bg-muted">
        {events.map((event, idx) => {
          const status = (event.status || "upcoming").toLowerCase();
          
          let statusColor = "text-muted-foreground border-border bg-muted";
          let statusTextClass = "text-primary-foreground";
          let Indicator = Circle;

          if (status === "done" || status === "complete" || status === "completed") {
            statusColor = "text-emerald-400 border-emerald-500 bg-emerald-500/10";
            statusTextClass = "text-primary-foreground";
            Indicator = CheckCircle2;
          } else if (status === "active" || status === "running" || status === "in-progress") {
            statusColor = "text-primary border-primary bg-primary/10 animate-pulse";
            statusTextClass = "text-primary-foreground font-semibold";
          }

          return (
            <div key={idx} className="relative flex flex-col gap-0.5">
              <span className={`absolute -left-[23.5px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border ${statusColor} shrink-0`}>
                <Indicator className="h-2.5 w-2.5" />
              </span>

              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                <span className={`text-[12px] leading-snug ${statusTextClass}`}>
                  {event.label}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground tracking-wider">
                  {event.date}
                </span>
              </div>

              {event.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  {event.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

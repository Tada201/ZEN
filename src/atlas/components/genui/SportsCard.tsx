import { Badge } from "@/components/ui/badge";

export function SportsCard({ league, status, data }: any) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{league} • {status}</span>
        </div>
        <Badge variant="outline" className="text-[9px] font-bold uppercase border-border/50">Live Data</Badge>
      </div>
      <div className="space-y-4">
        {data?.matchups?.map((m: any, i: number) => (
          <div key={i} className="flex items-center justify-between group">
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{m.team1}</span>
                <span className="text-sm font-bold tabular-nums">{m.score1}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{m.team2}</span>
                <span className="text-sm font-bold tabular-nums">{m.score2}</span>
              </div>
            </div>
            <div className="w-px h-10 bg-border/40 mx-4" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-muted-foreground uppercase">{m.status || "Final"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

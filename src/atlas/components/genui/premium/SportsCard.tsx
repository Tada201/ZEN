import { Clock, MapPin } from 'lucide-react';

export function SportsCard({ data }: { data: any }) {
  const home = data.homeTeam || data.home_team || data.home || 'Home';
  const away = data.awayTeam || data.away_team || data.away || 'Away';
  const homeScore = data.homeScore ?? data.home_score;
  const awayScore = data.awayScore ?? data.away_score;
  const status = data.status || data.gameStatus || 'Scheduled';
  const venue = data.venue || data.stadium || data.location;
  const league = data.league || data.tournament || '';
  const time = data.time || data.startTime || data.start_time || '';
  const period = data.period || data.quarter || '';

  const isLive = status === 'Live' || status === 'live' || status === 'In Progress';
  const isFinal = status === 'Final' || status === 'final' || status === 'FT' || status === 'Finished';

  return (
    <div className="rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg w-full max-w-md">
      {league && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-black text-primary-foreground/30 uppercase tracking-widest">{league}</span>
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          )}
          {isFinal && (
            <span className="text-[9px] font-bold text-primary-foreground/30 uppercase">FINAL</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <p className="text-xs text-primary-foreground/40 mb-1 truncate">{home}</p>
          <span className={isLive ? "text-2xl font-black text-primary-foreground" : "text-2xl font-black text-primary-foreground/80"}>
            {homeScore != null ? homeScore : '—'}
          </span>
        </div>
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-bold text-primary-foreground/20 uppercase">VS</span>
          {period && <span className="text-[9px] text-primary-foreground/30">{period}</span>}
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs text-primary-foreground/40 mb-1 truncate">{away}</p>
          <span className={isLive ? "text-2xl font-black text-primary-foreground" : "text-2xl font-black text-primary-foreground/80"}>
            {awayScore != null ? awayScore : '—'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border/[0.06] pt-3 mt-3">
        {venue && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-primary-foreground/30 shrink-0" />
            <span className="text-[10px] text-primary-foreground/50 truncate">{venue}</span>
          </div>
        )}
        {time && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-primary-foreground/30 shrink-0" />
            <span className="text-[10px] text-primary-foreground/50">{time}</span>
          </div>
        )}
      </div>
      {(data.players && Array.isArray(data.players)) && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border/[0.06]">
          {data.players.slice(0, 6).map((player: any, i: number) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-card/[0.04] text-[10px] text-primary-foreground/50 border border-border/[0.04]">
              {player.name || player}
            </span>
          ))}
          {data.players.length > 6 && (
            <span className="px-2 py-0.5 text-[10px] text-primary-foreground/30">+{data.players.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}

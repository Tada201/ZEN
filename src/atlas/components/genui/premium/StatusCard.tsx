import { AlertTriangle, CheckCircle2, Info, XCircle, Clock, GitPullRequest } from 'lucide-react';

const STATUS_ICONS: Record<string, any> = {
  success: CheckCircle2,
  ok: CheckCircle2,
  done: CheckCircle2,
  completed: CheckCircle2,
  passed: CheckCircle2,
  error: XCircle,
  failed: XCircle,
  failure: XCircle,
  warning: AlertTriangle,
  warn: AlertTriangle,
  info: Info,
  pending: Clock,
  running: Clock,
  'in-progress': Clock,
  pr: GitPullRequest,
  deploy: GitPullRequest,
  alert: AlertTriangle,
};

const STATUS_COLORS: Record<string, string> = {
  success: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  ok: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  done: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  completed: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  passed: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10',
  error: 'text-rose-400 border-rose-400/20 bg-rose-400/10',
  failed: 'text-rose-400 border-rose-400/20 bg-rose-400/10',
  failure: 'text-rose-400 border-rose-400/20 bg-rose-400/10',
  warning: 'text-amber-400 border-amber-400/20 bg-amber-400/10',
  warn: 'text-amber-400 border-amber-400/20 bg-amber-400/10',
  info: 'text-blue-400 border-blue-400/20 bg-blue-400/10',
  pending: 'text-zinc-400 border-zinc-400/20 bg-zinc-400/10',
  running: 'text-blue-400 border-blue-400/20 bg-blue-400/10',
  'in-progress': 'text-blue-400 border-blue-400/20 bg-blue-400/10',
  pr: 'text-purple-400 border-purple-400/20 bg-purple-400/10',
  deploy: 'text-purple-400 border-purple-400/20 bg-purple-400/10',
  alert: 'text-amber-400 border-amber-400/20 bg-amber-400/10',
};

export function StatusCard({ data }: { data: any }) {
  const title = data.title || data.name || 'Status';
  const status = (data.status || data.state || data.level || 'info').toLowerCase();
  const message = data.message || data.description || data.summary || '';
  const fields = data.fields || data.details || {};

  const Icon = STATUS_ICONS[status] || Info;
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.info;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg w-full max-w-md">
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-xl border ${colorClass}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-white text-sm truncate">{title}</h4>
            {status !== 'info' && (
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${colorClass}`}>
                {status}
              </span>
            )}
          </div>
          {message && <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{message}</p>}
        </div>
      </div>
      {Object.keys(fields).length > 0 && (
        <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex justify-between items-baseline gap-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">{key}</span>
              <span className="text-[11px] text-white/80 text-right truncate font-mono">
                {String(value ?? '—')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

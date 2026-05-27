import { Paperclip, Star, Trash2 } from "lucide-react";
import { DemoCard } from "../Section";
import { MailRow, SEED_MAIL } from "./combosData";

interface CombosInboxProps {
  mailRows: MailRow[];
  setMailRows: (rows: MailRow[]) => void;
  toggleStar: (id: string) => void;
  markRead: (id: string) => void;
  removeRow: (id: string) => void;
}

export function CombosInbox({
  mailRows,
  setMailRows,
  toggleStar,
  markRead,
  removeRow,
}: CombosInboxProps) {
  return (
    <DemoCard
      label="Inbox"
      selection={{
        id: "cb-inbox", name: "Email / Inbox List", category: "Combos",
        variants: ["unread dot", "starred", "with attachment"],
        jsx: `<ul role="list" className="divide-y">\n  <li className="flex items-center gap-3 p-3">\n    <Avatar /> <Subject /> <Time />\n  </li>\n</ul>`,
      }}
      className="md:col-span-2 xl:col-span-1"
    >
      <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Inbox</h4>
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
              {mailRows.filter((mail) => mail.unread).length}
            </span>
          </div>
          <button
            onClick={() => setMailRows(SEED_MAIL)}
            className="press text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>
        <ul role="list" className="divide-y divide-border">
          {mailRows.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-muted-foreground">Inbox zero. Nice work.</li>
          )}
          {mailRows.map((mail) => (
            <li key={mail.id} className={`group flex items-start gap-3 px-3 py-2.5 ${mail.unread ? "bg-primary/[0.03]" : ""}`}>
              <button
                aria-label={mail.unread ? "Mark as read" : "Read"}
                onClick={() => markRead(mail.id)}
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${mail.unread ? "bg-primary" : "bg-transparent border border-border"}`}
              />
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
                {mail.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-xs ${mail.unread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>{mail.from}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{mail.time}</span>
                </div>
                <div className={`mt-0.5 truncate text-xs ${mail.unread ? "text-foreground" : "text-muted-foreground"}`}>
                  {mail.subject}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {mail.hasAttach && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                  <p className="truncate text-[11px] text-muted-foreground">{mail.preview}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  aria-label={mail.starred ? "Unstar" : "Star"}
                  onClick={() => toggleStar(mail.id)}
                  className="press"
                >
                  <Star className={`h-3.5 w-3.5 ${mail.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                </button>
                <button
                  aria-label="Delete"
                  onClick={() => removeRow(mail.id)}
                  className="press text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DemoCard>
  );
}

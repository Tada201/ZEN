import { ArrowRight, Bell, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DemoCard } from "../Section";
import { Notif } from "./combosData";

interface CombosNotificationCenterProps {
  notifTab: "all" | "unread";
  unreadCount: number;
  visibleNotifs: Notif[];
  setNotifTab: (tab: "all" | "unread") => void;
  markAllRead: () => void;
  dismissNotif: (id: string) => void;
}

export function CombosNotificationCenter({
  notifTab,
  unreadCount,
  visibleNotifs,
  setNotifTab,
  markAllRead,
  dismissNotif,
}: CombosNotificationCenterProps) {
  return (
    <DemoCard
      label="Notification center"
      selection={{
        id: "cb-notif", name: "Notification Center", category: "Combos",
        variants: ["popover", "tabs-all-unread", "mark-all-read"],
        jsx: `<Popover>\n  <PopoverTrigger>\n    <Bell /><Badge>{unread}</Badge>\n  </PopoverTrigger>\n  <PopoverContent>\n    <Tabs>\n      <TabsList>All | Unread</TabsList>\n      {notifs.map(n => <NotifRow />)}\n    </Tabs>\n  </PopoverContent>\n</Popover>`,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center py-4">
        <Popover>
          <PopoverTrigger asChild>
            <button className="press relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="center">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h4 className="text-sm font-semibold">Notifications</h4>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="press text-[10px] font-medium text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex border-b border-border">
              {(["all", "unread"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setNotifTab(tab)}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                    notifTab === tab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                  {tab === "unread" && unreadCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-border">
              {visibleNotifs.length === 0 ? (
                <li className="py-8 text-center text-xs text-muted-foreground">You're all caught up.</li>
              ) : visibleNotifs.map((notif) => (
                <li key={notif.id} className={`group flex items-start gap-2.5 px-3 py-2.5 ${!notif.read ? "bg-primary/[0.03]" : ""}`}>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-base">{notif.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug">{notif.text}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{notif.time}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    {!notif.read && <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />}
                    <button
                      onClick={() => dismissNotif(notif.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity press text-muted-foreground hover:text-foreground"
                      aria-label="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-3 py-2">
              <button className="press flex w-full items-center justify-center gap-1 text-[11px] font-medium text-primary hover:underline">
                View all notifications <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </DemoCard>
  );
}

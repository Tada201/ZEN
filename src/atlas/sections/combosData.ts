export type MailRow = {
  id: string;
  from: string;
  initials: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  starred: boolean;
  hasAttach?: boolean;
};

export const SEED_MAIL: MailRow[] = [
  { id: "m1", from: "Sarah Chen", initials: "SC", subject: "Design review notes from Friday", preview: "Loved the new motion timing - one nit on the toast position...", time: "9:42 AM", unread: true, starred: true, hasAttach: true },
  { id: "m2", from: "GitHub", initials: "GH", subject: "PR #284 ready for review", preview: "fix(theme): respect reduced-motion when applying preset", time: "8:16 AM", unread: true, starred: false },
  { id: "m3", from: "Linear", initials: "LN", subject: "3 issues moved to In Review", preview: "ATL-42, ATL-58, ATL-61 are awaiting your sign-off", time: "Yesterday", unread: false, starred: false },
  { id: "m4", from: "Marcus Rivera", initials: "MR", subject: "Lunch on Thursday?", preview: "Free anytime after 12:30 - pick a spot near the office?", time: "Mon", unread: false, starred: false },
];

export type Notif = {
  id: string;
  icon: string;
  text: string;
  time: string;
  read: boolean;
};

export const SEED_NOTIFS: Notif[] = [
  { id: "n1", icon: "💬", text: "Sarah left a comment on your PR #284", time: "2m ago", read: false },
  { id: "n2", icon: "✅", text: "CI pipeline passed on main branch", time: "14m ago", read: false },
  { id: "n3", icon: "🎉", text: "ATL-42 moved to Done by Marcus", time: "1h ago", read: false },
  { id: "n4", icon: "🔔", text: "Weekly digest is ready to view", time: "Yesterday", read: true },
  { id: "n5", icon: "📌", text: "You were mentioned in #design-review", time: "Yesterday", read: true },
];

export const STATUS_FILTERS = ["All", "Active", "Review", "Done", "Archived"] as const;
export type Status = (typeof STATUS_FILTERS)[number];

export type FilterRow = {
  id: string;
  name: string;
  status: Status;
  priority: string;
};

export const FILTER_ROWS: FilterRow[] = [
  { id: "t1", name: "Update onboarding flow", status: "Active", priority: "High" },
  { id: "t2", name: "Audit contrast tokens", status: "Done", priority: "Medium" },
  { id: "t3", name: "Add range slider demo", status: "Review", priority: "High" },
  { id: "t4", name: "Write motion guidelines", status: "Active", priority: "Low" },
  { id: "t5", name: "Migrate legacy inputs", status: "Archived", priority: "Low" },
  { id: "t6", name: "Publish v1.0 changelog", status: "Review", priority: "Medium" },
];

export const WIZARD_STEPS = ["Account", "Team", "Plan"] as const;

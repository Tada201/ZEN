import { useState } from "react";
import { DemoCard } from "../Section";

const AVATAR_USERS = [
  { initials: "SC", label: "Sarah Chen" },
  { initials: "MR", label: "Marcus Rivera" },
  { initials: "AT", label: "Aiko Tanaka" },
  { initials: "ER", label: "Elena Rossi" },
  { initials: "JD", label: "James Doe" },
];

const AVATAR_GRADIENTS = [
  "var(--gradient-accent)",
  "linear-gradient(135deg, hsl(260,70%,55%), hsl(220,80%,60%))",
  "linear-gradient(135deg, hsl(160,65%,40%), hsl(200,70%,50%))",
  "linear-gradient(135deg, hsl(30,90%,55%), hsl(50,90%,55%))",
  "linear-gradient(135deg, hsl(340,75%,55%), hsl(310,70%,55%))",
];

export function DataDisplayAvatarGroup() {
  const [shownCount, setShownCount] = useState(3);

  return (
    <DemoCard
      label="Avatar group"
      selection={{
        id: "dd-avatars", name: "Avatar Group", category: "Data Display",
        variants: ["stacked", "overflow-count", "expandable"],
        jsx: `<div className="flex -space-x-2">\n  {users.slice(0, 3).map(u => <Avatar key={u} />)}\n  {users.length > 3 && <span>+{users.length - 3}</span>}\n</div>`,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Assigned to</div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {AVATAR_USERS.slice(0, shownCount).map((user, index) => (
                <div
                  key={user.initials}
                  title={user.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-primary-foreground ring-0"
                  style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length], zIndex: shownCount - index }}
                >
                  {user.initials}
                </div>
              ))}
              {shownCount < AVATAR_USERS.length && (
                <button
                  onClick={() => setShownCount(AVATAR_USERS.length)}
                  className="press flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground hover:bg-muted/80"
                  style={{ zIndex: 0 }}
                >
                  +{AVATAR_USERS.length - shownCount}
                </button>
              )}
              {shownCount === AVATAR_USERS.length && (
                <button
                  onClick={() => setShownCount(3)}
                  className="press flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground hover:bg-muted/80"
                  style={{ zIndex: 0 }}
                >
                  Reset
                </button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {shownCount < AVATAR_USERS.length ? `${shownCount} of ${AVATAR_USERS.length} - click +${AVATAR_USERS.length - shownCount} to expand` : `All ${AVATAR_USERS.length} members`}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Size variants</div>
          <div className="flex items-end gap-3">
            {([6, 8, 10, 12] as const).map((size, index) => (
              <div
                key={size}
                className={`flex h-${size} w-${size} items-center justify-center rounded-full border-2 border-background text-primary-foreground font-bold`}
                style={{ background: AVATAR_GRADIENTS[index], fontSize: `${size * 1.2}px`, width: `${size * 4}px`, height: `${size * 4}px` }}
              >
                {AVATAR_USERS[index].initials}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DemoCard>
  );
}

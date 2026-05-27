import { useState } from "react";
import { Heart, Reply } from "lucide-react";
import { DemoCard } from "../Section";

type Comment = {
  id: string;
  author: string;
  initials: string;
  body: string;
  time: string;
  likes: number;
  liked: boolean;
  replies?: Comment[];
};

const SEED_COMMENTS: Comment[] = [
  {
    id: "c1", author: "Marcus Rivera", initials: "MR", body: "The new gradient palette is perfect - works great across all themes!", time: "2h ago", likes: 5, liked: false,
    replies: [
      { id: "c1r1", author: "Sarah Chen", initials: "SC", body: "Thanks! I tweaked the stop positions to avoid the muddy middle.", time: "1h ago", likes: 2, liked: true },
    ],
  },
  { id: "c2", author: "Aiko Tanaka", initials: "AT", body: "Could we add a monochrome preset too? Would help for print docs.", time: "45m ago", likes: 3, liked: false },
];

function CommentNode({ c, depth = 0 }: { c: Comment; depth?: number }) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replying, setReplying] = useState(false);

  return (
    <div className={depth > 0 ? "ml-8 mt-2 border-l-2 border-border pl-3" : ""}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>{c.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold">{c.author}</span>
            <span className="text-[10px] text-muted-foreground">{c.time}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.body}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              className="press flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setLiked((l) => !l); setLikes((n) => liked ? n - 1 : n + 1); }}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={`h-3 w-3 ${liked ? "fill-destructive text-destructive" : ""}`} /> {likes}
            </button>
            <button
              className="press flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setReplying((r) => !r); }}
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
          </div>
          {replying && (
            <div className="mt-2 flex gap-2">
              <input autoFocus className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Write a reply..." onClick={(e) => e.stopPropagation()} />
              <button className="press rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground" onClick={(e) => { e.stopPropagation(); setReplying(false); }}>Send</button>
            </div>
          )}
        </div>
      </div>
      {c.replies?.map((reply) => <CommentNode key={reply.id} c={reply} depth={depth + 1} />)}
    </div>
  );
}

export function DataDisplayComments() {
  return (
    <DemoCard
      label="Comments thread"
      selection={{
        id: "dd-comments", name: "Comments Thread", category: "Data Display",
        variants: ["nested", "reactions", "reply"],
        jsx: `<CommentNode comment={c} depth={0} />`,
      }}
      className="md:col-span-2 xl:col-span-2"
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-4">
        {SEED_COMMENTS.map((comment) => <CommentNode key={comment.id} c={comment} />)}
        <div className="flex gap-2 border-t border-border pt-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
            You
          </div>
          <input
            placeholder="Add a comment..."
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </DemoCard>
  );
}

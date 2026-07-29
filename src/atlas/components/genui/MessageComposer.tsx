import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MessageComposer({ topic, variants = [] }: any) {
  const [selected, setSelected] = useState(0);
  
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="p-4 border-b border-border bg-muted flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Message Drafts: {topic}</span>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest hover:bg-primary/10 hover:text-primary">
          Copy All
        </Button>
      </div>
      <div className="flex border-b border-border bg-muted">
        {variants.map((v: any, i: number) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={cn(
              "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors",
              selected === i ? "bg-background text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="p-6">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{variants[selected]?.content}</p>
        <div className="mt-6 flex justify-end">
          <Button size="sm" className="h-8 rounded-lg text-xs font-semibold px-4">
            Send Message
          </Button>
        </div>
      </div>
    </div>
  );
}

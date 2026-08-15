import { ExternalLink } from "lucide-react";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";

interface ReferenceItem {
  number: number;
  title: string;
  url: string;
}

export function ReferencesGrid({ items, onOpenLink }: { items: ReferenceItem[]; onOpenLink?: (url: string) => boolean }) {
  return (
    <div className="my-3">
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">
        References
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((ref) => {
          const safeHref = /^(https?:\/\/)/i.test(ref.url) && isSafeGeneratedHref(ref.url) ? ref.url : null;
          const body = (
            <>
              <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {ref.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{ref.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{ref.url}</span>
              </span>
              {safeHref && <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />}
            </>
          );
          const className = "flex items-start gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-[13px] leading-snug transition-colors hover:bg-muted";

          if (!safeHref) {
            return <div key={ref.number} className={className}>{body}</div>;
          }

          return (
            <a
              key={ref.number}
              href={safeHref}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (onOpenLink?.(safeHref)) event.preventDefault();
              }}
              className={className}
            >
              {body}
            </a>
          );
        })}
      </div>
    </div>
  );
}

/// Parse a markdown ## References section into structured items.
/// Returns the items and the content with the references section removed.
export function parseReferencesSection(content: string): {
  clean: string;
  items: ReferenceItem[] | null;
} {
  // Parse line-by-line so a code sample containing "## References" is never
  // mistaken for the assistant's references section. Normalize CRLF because
  // persisted messages can come from Windows or provider payloads.
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  let fenceMarker = "";
  let headingIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1][0] === fenceMarker[0] && fence[1].length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (!inFence && /^ {0,3}#{2,6}\s+References\s*$/i.test(line)) {
      headingIndex = index;
      break;
    }
  }

  if (headingIndex < 0) return { clean: content, items: null };

  let listIndex = headingIndex + 1;
  while (listIndex < lines.length && !lines[listIndex].trim()) listIndex += 1;
  const listLines: string[] = [];
  while (listIndex < lines.length && /^\s*\d+\.\s+.+/.test(lines[listIndex])) {
    listLines.push(lines[listIndex].trim());
    listIndex += 1;
  }
  if (listLines.length === 0) return { clean: content, items: null };

  const items = listLines
    .map((line) => {
      const numMatch = line.match(/^(\d+)\.\s+/);
      const number = numMatch ? parseInt(numMatch[1], 10) : 0;
      const text = line.replace(/^\d+\.\s+/, "").trim();
      const linkMatch = text.match(/^\[(.+?)\]\((.+)\)$/);
      return linkMatch
        ? { number, title: linkMatch[1], url: linkMatch[2] }
        : { number, title: text, url: text };
    })
    .filter((item) => item.number > 0);

  if (items.length === 0) return { clean: content, items: null };

  const clean = [...lines.slice(0, headingIndex), ...lines.slice(listIndex)].join("\n");
  return { clean, items };
}

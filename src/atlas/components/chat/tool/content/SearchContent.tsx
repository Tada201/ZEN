import { ExternalLink } from "lucide-react";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";

function isSafeSearchUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, "http://example.com");
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

interface SearchContentProps {
  outputPreview: ToolOutputPreview;
}

export function SearchContent({ outputPreview }: SearchContentProps) {
  if (outputPreview.results.length === 0) return null;

  return (
    <Panel label="Results">
      <div className="flex flex-col gap-2">
        {outputPreview.results.slice(0, 5).map((result, index) => (
          <div key={`${result.title}-${index}`} className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded bg-muted px-1 text-[10px] font-medium text-foreground">
                {index + 1}
              </span>
              <span className="truncate text-[12px] font-medium text-foreground">{result.title}</span>
            </div>
            {result.summary && (
              <div className="line-clamp-2 pl-6 text-[11px] text-muted-foreground">{result.summary}</div>
            )}                {result.url &&
                  (isSafeSearchUrl(result.url) ? (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-6 inline-flex items-center gap-0.5 truncate text-[10px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {result.url}
                    </a>
                  ) : (
                    <span className="ml-6 truncate text-[10px] text-muted-foreground">{result.url}</span>
                  ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

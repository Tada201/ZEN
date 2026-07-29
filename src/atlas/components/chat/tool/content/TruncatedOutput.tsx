import { useState } from "react";
import { truncateMiddle } from "./truncateOutput";

interface TruncatedOutputProps {
  content: string;
  headLines?: number;
  tailLines?: number;
  className?: string;
}

export function TruncatedOutput({
  content,
  headLines = 6,
  tailLines = 6,
  className,
}: TruncatedOutputProps) {
  const [showAll, setShowAll] = useState(false);
  const lines = content.split("\n");
  const cap = headLines + tailLines;
  const isLong = lines.length > cap;
  const truncated = !showAll && isLong ? truncateMiddle(lines, headLines, tailLines) : null;

  return (
    <div className={className}>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
        {truncated ? (
          <>
            {truncated.head.join("\n")}
            {truncated.middleCount > 0 && (
              <>
                {"\n"}
                <span className="text-muted-foreground">
                  … {truncated.middleCount} more line
                  {truncated.middleCount === 1 ? "" : "s"} …
                </span>
                {"\n"}
              </>
            )}
            {truncated.tail.length > 0 && <>{truncated.tail.join("\n")}</>}
          </>
        ) : (
          content
        )}
      </pre>

      {isLong && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-2 text-[11px] font-medium text-primary hover:underline"
        >
          {showAll ? "Show less" : `Show full output (${lines.length - cap} more)`}
        </button>
      )}
    </div>
  );
}

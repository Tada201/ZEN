import { FileText, Hash } from "lucide-react";

interface DocumentSummaryData {
  filename: string;
  fileType: string;
  fileSize: string;
  wordCount?: number;
  language?: string;
  summary: string;
  keyPoints: string[];
  sentiment?: "positive" | "neutral" | "negative" | string;
}

export function DocumentSummaryCard({ data }: { data: DocumentSummaryData }) {
  const filename = data.filename || "document.txt";
  const fileType = data.fileType || "File";
  const fileSize = data.fileSize || "--";
  const wordCount = data.wordCount;
  const language = data.language;
  const summary = data.summary || "";
  const keyPoints = data.keyPoints || [];
  const sentiment = data.sentiment;

  const getSentimentColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "positive":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
      case "negative":
        return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      default:
        return "text-muted-foreground border-border/20 bg-muted/10";
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-border/10 bg-card/5 text-primary">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-primary-foreground truncate max-w-[200px] leading-tight" title={filename}>
              {filename}
            </h3>
            <span className="text-[9px] font-mono text-primary-foreground/40 uppercase tracking-widest">
              {fileType} · {fileSize}
            </span>
          </div>
        </div>

        {sentiment && (
          <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getSentimentColor(sentiment)}`}>
            {sentiment} Tone
          </span>
        )}
      </div>

      <div className="mb-4">
        <span className="text-[9px] uppercase font-mono tracking-widest text-primary-foreground/20 block mb-1">
          Executive Summary
        </span>
        <p className="text-[12px] text-primary-foreground/80 leading-relaxed font-sans">
          {summary}
        </p>
      </div>

      {keyPoints.length > 0 && (
        <div className="mb-4">
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary-foreground/20 block mb-2">
            Key Insights
          </span>
          <ul className="space-y-1.5 pl-0 list-none">
            {keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[11px] text-primary-foreground/70 leading-relaxed">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(wordCount !== undefined || language) && (
        <div className="flex gap-4 pt-3.5 border-t border-border/[0.06] text-[10px] font-mono text-primary-foreground/30">
          {wordCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-primary-foreground/20" />
              <span>{wordCount.toLocaleString()} Words</span>
            </div>
          )}
          {language && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span>Language: <strong className="text-primary-foreground/50">{language}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

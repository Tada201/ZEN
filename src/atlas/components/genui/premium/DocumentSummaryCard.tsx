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
        return "text-emerald-400 border-emerald-500 bg-emerald-500/10";
      case "negative":
        return "text-rose-400 border-rose-500 bg-rose-500/10";
      default:
        return "text-muted-foreground border-border bg-muted";
    }
  };

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-border bg-muted text-primary">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-primary-foreground truncate max-w-[200px] leading-tight" title={filename}>
              {filename}
            </h3>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
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
        <span className="text-[9px] uppercase font-mono tracking-widest text-muted-foreground block mb-1">
          Executive Summary
        </span>
        <p className="text-[12px] text-primary-foreground leading-relaxed font-sans">
          {summary}
        </p>
      </div>

      {keyPoints.length > 0 && (
        <div className="mb-4">
          <span className="text-[9px] uppercase font-mono tracking-widest text-muted-foreground block mb-2">
            Key Insights
          </span>
          <ul className="space-y-1.5 pl-0 list-none">
            {keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[11px] text-primary-foreground leading-relaxed">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(wordCount !== undefined || language) && (
        <div className="flex gap-4 pt-3.5 border-t border-border text-[10px] font-mono text-muted-foreground">
          {wordCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-muted-foreground" />
              <span>{wordCount.toLocaleString()} Words</span>
            </div>
          )}
          {language && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span>Language: <strong className="text-primary-foreground">{language}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

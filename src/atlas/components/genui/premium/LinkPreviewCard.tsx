import { ExternalLink, Globe } from "lucide-react";

interface LinkPreviewData {
  url: string;
  title: string;
  description?: string;
  domain?: string;
  favicon?: string;
  image?: string;
  publishedAt?: string;
}

export function LinkPreviewCard({ data }: { data: LinkPreviewData }) {
  const url = data.url || "#";
  const title = data.title || "Link Preview";
  const description = data.description || "";
  const domain = data.domain || (url !== "#" ? new URL(url).hostname : "");
  const favicon = data.favicon;
  const image = data.image;
  const publishedAt = data.publishedAt;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col sm:flex-row items-stretch w-full max-w-lg rounded-xl border border-border bg-card hover:bg-muted active:bg-muted transition-all overflow-hidden group shadow-lg"
    >
      <div className="flex flex-col flex-1 p-4 min-w-0 justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="w-3.5 h-3.5 object-contain rounded-sm"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground truncate">{domain}</span>
          </div>

          <h3 className="text-sm font-semibold text-primary-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {title}
          </h3>

          {description && (
            <p className="text-[11px] text-primary-foreground mt-1.5 line-clamp-3 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border text-[10px] text-muted-foreground font-mono">
          {publishedAt && <span>{publishedAt}</span>}
          <span className="flex items-center gap-1 ml-auto text-primary group-hover:text-primary transition-colors">
            Visit link <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>

      {image && (
        <div className="relative w-full sm:w-36 h-36 sm:h-auto shrink-0 overflow-hidden bg-muted border-t sm:border-t-0 sm:border-l border-border">
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLElement).parentElement?.remove();
            }}
          />
        </div>
      )}
    </a>
  );
}

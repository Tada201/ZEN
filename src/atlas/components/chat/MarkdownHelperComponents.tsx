import React, { Component, type ReactNode, useState, useCallback } from "react";
import { Play, ChevronLeft, ChevronRight, ExternalLink, Download } from "lucide-react";
import { AppDialog } from "@/components/ui/AppDialog";
import { chatApi } from "@/api/chatApi";
import { toast } from "sonner";
import { toAssetUrl } from "@/lib/utils/assetUrl";

/**
 * MarkdownErrorBoundary - Catches rendering errors in markdown blocks
 * and displays a safe fallback instead of crashing the entire message.
 */
export class MarkdownErrorBoundary extends Component<
  { children: ReactNode; content?: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; content?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="my-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center gap-2 text-destructive text-[10px] font-mono uppercase tracking-widest mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Markdown Render Error
          </div>
          <pre className="text-[11px] font-mono text-destructive whitespace-pre-wrap overflow-auto max-h-32">
            {this.props.content || "Content could not be rendered"}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function flattenChildren(children: any): string {
  if (!children) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(flattenChildren).join("");
  if (typeof children === "object" && children.props?.children) {
    return flattenChildren(children.props.children);
  }
  return String(children);
}

export function normalizeCodeLanguage(language?: string): string {
  const lang = (language || "").toLowerCase();
  if (lang === "openui-lang" || lang === "openuilang" || lang === "genui") return "openui";
  return lang;
}

// ── YouTube preview ──────────────────────────────────────────
const YT_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/i;

export function parseYoutubeId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match ? match[1] : null;
}

export function YoutubePreview({ videoId }: { videoId: string }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noreferrer"
      className="block my-4 group relative overflow-hidden rounded-xl border border-border/30 bg-card/90 hover:border-primary/30 transition-all duration-200 max-w-[480px]"
    >
      <div className="relative aspect-video bg-background/90 overflow-hidden">
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt="YouTube video preview"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-background/60 flex items-center justify-center group-hover:bg-red-600/80 transition-colors">
            <Play className="w-5 h-5 text-foreground ml-0.5" />
          </div>
        </div>
      </div>
      <div className="px-3 py-2 flex items-center gap-2">
        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground truncate">youtube.com/watch?v={videoId}</span>
      </div>
    </a>
  );
}

// ── Image gallery / lightbox ─────────────────────────────────
export function ImageGallery({ images }: { images: Array<{ src: string; alt: string }> }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const open = (idx: number) => setLightboxIndex(idx);
  const close = () => setLightboxIndex(null);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lightboxIndex === null || lightboxIndex < 0 || lightboxIndex >= images.length) return;
    const currentSrc = images[lightboxIndex].src;
    setExporting(true);
    const toastId = toast.loading("Saving image to workspace...");
    try {
      const savedPath = await chatApi.exportImageToWorkspace(currentSrc);
      toast.success(`Image saved to workspace: ${savedPath}`, { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to export image: ${err?.message || err}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [lightboxIndex, images]);

  const prev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(i => i !== null && i > 0 ? i - 1 : i);
  }, []);

  const next = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(i => i !== null && i < images.length - 1 ? i + 1 : i);
  }, [images.length]);

  return (
    <>
      <div className="my-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin -mx-1 px-1" style={{ scrollSnapType: "x mandatory" }}>
        {images.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => open(idx)}
            className="shrink-0 relative overflow-hidden rounded-lg border border-border/30 hover:border-primary/40 transition-all duration-200 group"
            style={{ scrollSnapAlign: "start" }}
          >
            <img
              src={toAssetUrl(img.src)}
              alt={img.alt || ""}
              className="h-32 w-auto max-w-[200px] object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <AppDialog
        open={lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < images.length}
        onOpenChange={(isOpen) => { if (!isOpen) close(); }}
        title={lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < images.length ? (images[lightboxIndex].alt || "Image Preview") : "Image Preview"}
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-mono">
              {lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < images.length ? `${lightboxIndex + 1} / ${images.length}` : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] rounded text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Download size={12} />
                <span>{exporting ? "Saving..." : "Export to Workspace"}</span>
              </button>
              <button
                type="button"
                onClick={close}
                className="border border-border px-3 py-1.5 text-[11px] rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < images.length && (
          <div className="relative flex items-center justify-center min-h-[300px]">
            {lightboxIndex > 0 && (
              <button
                type="button"
                onClick={prev}
                className="absolute left-0 p-2 rounded-full bg-background/40 hover:bg-background/60 transition-colors z-10"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            <img
              src={toAssetUrl(images[lightboxIndex].src)}
              alt={images[lightboxIndex].alt || ""}
              className="max-h-[60vh] max-w-full object-contain rounded-md"
            />
            {lightboxIndex < images.length - 1 && (
              <button
                type="button"
                onClick={next}
                className="absolute right-0 p-2 rounded-full bg-background/40 hover:bg-background/60 transition-colors z-10"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            )}
          </div>
        )}
      </AppDialog>
    </>
  );
}

// Helper to detect if children contain primarily images (for gallery grouping).
// Recognizes both native <img> elements and custom image wrapper components
// (e.g. InteractiveImage) by duck-typing on src/alt props.
export function extractImagesFromChildren(children: React.ReactNode): Array<{ src: string; alt: string }> | null {
  const images: Array<{ src: string; alt: string }> = [];
  let hasNonImage = false;
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const props = child.props as Record<string, any>;
      // Native <img> or any custom component that receives src (e.g. InteractiveImage)
      if (child.type === "img" || (typeof props.src === "string" && props.src.length > 0)) {
        images.push({ src: props.src || "", alt: props.alt || "" });
        return;
      }
    }
    // Skip pure whitespace text nodes between images
    if (child && typeof child === "string" && child.trim() === "") return;
    // Non-image elements and non-whitespace text both prevent gallery mode
    hasNonImage = true;
  });
  if (images.length >= 2 && !hasNonImage) return images;
  return null;
}

export function stripCodeFence(content: string): string {
  return content
    .replace(/^```[^\n]*\n/, '')
    .replace(/\n```$/, '')
    .replace(/\n$/, '');
}

// Helper to remove the [!TYPE] text from the React element tree
export function removeAlertTag(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<any>;
      const elementChildren = React.Children.toArray(element.props.children);
      if (elementChildren.length > 0 && typeof elementChildren[0] === "string") {
        const firstStr = elementChildren[0];
        const match = firstStr.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (match) {
          const newChildren = [...elementChildren];
          newChildren[0] = firstStr.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, "").trimStart();
          return React.cloneElement(element, element.props, ...newChildren);
        }
      }
      if (element.props.children) {
        return React.cloneElement(element, {
          ...element.props,
          children: removeAlertTag(element.props.children),
        });
      }
    }
    return child;
  });
}

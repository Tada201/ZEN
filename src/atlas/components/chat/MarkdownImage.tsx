import React, { useState, useCallback } from "react";
import { Download } from "lucide-react";
import { AppDialog } from "@/components/ui/AppDialog";
import { chatApi } from "@/api/chatApi";
import { toast } from "sonner";
import { toAssetUrl } from "@/lib/utils/assetUrl";
import { presentExecutionError } from "../../agentRuntime/executionError";

export function InteractiveImage({ src, alt }: { src: string; alt: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resolvedSrc = toAssetUrl(src);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(true);
    const toastId = toast.loading("Saving image to workspace...");
    try {
      const savedPath = await chatApi.exportImageToWorkspace(src);
      toast.success(`Image saved to workspace: ${savedPath}`, { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to export image: ${presentExecutionError(err, { context: "persistence" }).summary}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [src]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block my-4 shrink-0 relative overflow-hidden rounded-lg border border-border hover:border-primary transition-all duration-200 group"
      >
        <img
          src={resolvedSrc}
          alt={alt}
          className="max-w-full rounded-lg hover:scale-[1.01] transition-transform duration-200"
          loading="lazy"
        />
      </button>

      <AppDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={alt || "Image Preview"}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
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
              onClick={() => setIsOpen(false)}
              className="border border-border px-3 py-1.5 text-[11px] rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="relative flex items-center justify-center min-h-[300px] p-2">
          <img
            src={resolvedSrc}
            alt={alt}
            className="max-h-[60vh] max-w-full object-contain rounded-md"
          />
        </div>
      </AppDialog>
    </>
  );
}

import { useCallback, useRef, useState } from "react";
import { FileUp, UploadCloud, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DemoCard } from "../Section";

export function InputsFileDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onPick = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 5));
  }, []);

  return (
    <DemoCard
      label="File dropzone"
      selection={{
        id: "i-dropzone", name: "File Dropzone", category: "Inputs & Forms",
        variants: ["multiple", "drag-and-drop"],
        jsx: `<div onDragOver={...} onDrop={...}>\n  <input type="file" multiple ref={ref} />\n</div>`,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-2">
        <Label>Attachments</Label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files); }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-5 text-center text-xs text-muted-foreground transition-colors",
            drag && "border-primary bg-primary/5 text-primary"
          )}
          aria-label="File dropzone. Click or drag files to upload."
        >
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
          <span>{drag ? "Drop files to upload" : "Drag & drop, or click to browse"}</span>
          <span className="text-[10px] opacity-70">PNG, JPG, PDF up to 10MB</span>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onPick(e.target.files)}
          />
        </div>
        {files.length > 0 && (
          <ul className="space-y-1 text-xs" aria-label="Selected files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded border border-border bg-card px-2 py-1">
                <span className="flex items-center gap-1.5 truncate">
                  <FileUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== index))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DemoCard>
  );
}

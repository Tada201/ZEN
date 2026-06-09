import { memo, useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Loader2, Play, Plus, RefreshCw, Trash2, Volume2 } from "lucide-react";
import { voiceApi, type VoiceModel } from "@/api/voiceApi";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { cn } from "@/lib/utils";

const PREVIEW_PHRASE = "Hello, this is a voice preview from Zen.";

interface CustomVoiceSelectorProps {
  disabled?: boolean;
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function voiceDetailLabel(voice: VoiceModel) {
  if (voice.is_default) return "Bundled Piper voice";
  const fileName = voice.path ? fileNameFromPath(voice.path) : voice.id;
  return `Imported / ${fileName}`;
}

export const CustomVoiceSelector = memo(({ disabled }: CustomVoiceSelectorProps) => {
  const activeVoiceId = useSettingsStore((s) => s.ttsPiperVoiceId ?? "default");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const [voices, setVoices] = useState<VoiceModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await voiceApi.listVoiceModels();
      setVoices(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
  }, []);

  const handleAddVoice = useCallback(async () => {
    setError(null);
    let onnxPath: string | null = null;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select Piper ONNX voice model",
        filters: [{ name: "Piper ONNX voice", extensions: ["onnx"] }],
      });
      if (!selected || typeof selected !== "string") return;
      onnxPath = selected;
    } catch (e) {
      setError(`File dialog failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const inferredConfig = onnxPath.replace(/\.onnx$/i, ".onnx.json");
    let configPath = inferredConfig;

    try {
      const configSelected = await open({
        multiple: false,
        directory: false,
        title: "Select matching Piper config (.json)",
        filters: [{ name: "Piper config", extensions: ["json"] }],
      });
      if (configSelected && typeof configSelected === "string") {
        configPath = configSelected;
      } else if (configSelected === null) {
        return;
      }
    } catch {
      // user cancelled; fall back to inferred path
    }

    setImporting(true);
    try {
      const added = await voiceApi.addVoiceModel(onnxPath, configPath);
      setVoices((prev) => [...prev.filter((v) => v.id !== added.id), added]);
      await voiceApi.setActiveVoiceModel(added.id);
      updateSetting({ ttsPiperVoiceId: added.id });
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }, [updateSetting]);

  const handleSelect = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await voiceApi.setActiveVoiceModel(id);
        updateSetting({ ttsPiperVoiceId: id });
      } catch (e) {
        setError(`Failed to activate voice: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [updateSetting],
  );

  const handlePreview = useCallback(
    async (id: string) => {
      setError(null);
      setPreviewingId(id);
      try {
        if (id !== activeVoiceId) {
          await voiceApi.setActiveVoiceModel(id);
          updateSetting({ ttsPiperVoiceId: id });
        }
        await voiceApi.speakText(PREVIEW_PHRASE);
      } catch (e) {
        setError(`Preview failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = setTimeout(() => {
          setPreviewingId(null);
          previewTimeoutRef.current = null;
        }, 1500);
      }
    },
    [activeVoiceId, updateSetting],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold text-white">
          <Volume2 size={12} className="text-brand-purple" />
          <span className="uppercase tracking-wider">Piper Voice Models</span>
          <span className="text-[10px] font-mono text-zinc-500">
            {voices.length} available
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <WorkbenchButton
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading || disabled}
            title="Reload voice list"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </WorkbenchButton>
          <WorkbenchButton
            size="sm"
            variant="secondary"
            onClick={handleAddVoice}
            disabled={importing || disabled}
          >
            {importing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            <span className="ml-1.5 text-[11px]">Import ONNX</span>
          </WorkbenchButton>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-white/[0.04] bg-zinc-950/40 p-1.5">
        {loading && voices.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            <span>Loading voices…</span>
          </div>
        ) : voices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-[11px] text-zinc-500">
            <span>No Piper voices found.</span>
            <span className="text-[10px] text-zinc-600">
              Click "Import ONNX" to add a custom voice.
            </span>
          </div>
        ) : (
          voices.map((voice) => {
            const isActive = voice.id === activeVoiceId;
            const isPreviewing = previewingId === voice.id;
            return (
              <div
                key={voice.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                  isActive
                    ? "border-brand-purple/40 bg-brand-purple/5"
                    : "border-white/[0.04] bg-zinc-900/30 hover:bg-zinc-900/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(voice.id)}
                  disabled={disabled}
                  className="flex flex-1 items-center gap-3 text-left disabled:opacity-50"
                  aria-label={`Select ${voice.name}`}
                >
                  <span
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
                      isActive
                        ? "border-brand-purple bg-brand-purple"
                        : "border-zinc-600 bg-transparent",
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[12px] font-semibold text-white">
                      {voice.name}
                    </span>
                    <span className="truncate text-[10px] text-zinc-500">
                      {voiceDetailLabel(voice)}
                    </span>
                  </div>
                </button>
                <WorkbenchButton
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePreview(voice.id)}
                  disabled={disabled || isPreviewing}
                  title={`Preview ${voice.name}`}
                >
                  {isPreviewing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                </WorkbenchButton>
                {!voice.is_default && (
                  <span
                    className="text-zinc-600"
                    title="Default bundled voice cannot be removed"
                  >
                    <Trash2 size={12} />
                  </span>
                )}
                {voice.is_default && (
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                    Bundled
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

CustomVoiceSelector.displayName = "CustomVoiceSelector";

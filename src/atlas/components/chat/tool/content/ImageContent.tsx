import { toAssetUrl } from "@/lib/utils/assetUrl";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
import { toToolInputRecord } from "../toToolInputRecord";

interface ImageContentProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
}

export function ImageContent({ toolCall, outputPreview }: ImageContentProps) {
  const input = toToolInputRecord(toolCall.input);
  const prompt = typeof input.prompt === "string" ? input.prompt : typeof input.query === "string" ? input.query : "";

  if (!outputPreview.imageUri || !isSafeGeneratedHref(outputPreview.imageUri)) return null;

  return (
    <div className="flex flex-col gap-2">
      {prompt && (
        <Panel label="Prompt">
          <div className="text-[12px] leading-relaxed text-foreground">{prompt}</div>
        </Panel>
      )}
      <Panel label="Image">
        <img
          src={toAssetUrl(outputPreview.imageUri)}
          alt={prompt || "Generated image"}
          loading="lazy"
          className="max-h-72 w-auto rounded-md border border-border"
        />
      </Panel>
    </div>
  );
}

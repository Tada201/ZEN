import type { ArtifactData, ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { TerminalContent } from "./TerminalContent";
import { SearchContent } from "./SearchContent";
import { ArtifactContent } from "./ArtifactContent";
import { GenericContent } from "./GenericContent";
import { ImageContent } from "./ImageContent";
import { McpContent } from "./McpContent";
import { BrowserContent } from "./BrowserContent";

interface ToolContentSwitchProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
  onViewArtifact?: (artifact: ArtifactData) => void;
  input: Record<string, unknown>;
}

function isTerminalTool(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("terminal") ||
    lower.includes("shell") ||
    lower.includes("command") ||
    lower.includes("bash") ||
    lower.includes("exec")
  );
}

function isMcpTool(name: string, input: Record<string, unknown>): boolean {
  const lower = name.toLowerCase();
  return lower.includes("mcp") || lower.startsWith("ext:") || typeof input.server === "string" || typeof input.server_name === "string";
}

function isBrowserTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("browser") || lower.includes("computer_use") || lower.includes("playwright");
}

export function ToolContentSwitch({
  toolCall,
  outputPreview,
  onViewArtifact,
  input,
}: ToolContentSwitchProps) {
  if (isMcpTool(toolCall.name, input)) {
    return <McpContent toolCall={toolCall} outputPreview={outputPreview} input={input} />;
  }

  if (isBrowserTool(toolCall.name)) {
    return <BrowserContent toolCall={toolCall} outputPreview={outputPreview} input={input} />;
  }

  if (outputPreview.imageUri) {
    return <ImageContent toolCall={toolCall} outputPreview={outputPreview} />;
  }

  if (
    isTerminalTool(toolCall.name) ||
    Boolean(outputPreview.stdout || outputPreview.stderr) ||
    outputPreview.exitCode !== undefined
  ) {
    return <TerminalContent toolCall={toolCall} outputPreview={outputPreview} />;
  }

  if (outputPreview.results.length > 0) {
    return <SearchContent outputPreview={outputPreview} />;
  }

  if (outputPreview.artifact) {
    return <ArtifactContent outputPreview={outputPreview} onViewArtifact={onViewArtifact} />;
  }

  return <GenericContent outputPreview={outputPreview} input={input} toolCall={toolCall} />;
}

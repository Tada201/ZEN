import type { ArtifactData } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";

interface ArtifactContentProps {
  outputPreview: ToolOutputPreview;
  onViewArtifact?: (artifact: ArtifactData) => void;
}

export function ArtifactContent({ outputPreview, onViewArtifact }: ArtifactContentProps) {
  const artifact = outputPreview.artifact;
  if (!artifact) return null;

  return (
    <Panel label="Artifact">
      <button
        type="button"
        onClick={() => onViewArtifact?.(artifact)}
        className="flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
      >
        Open {artifact.title}
      </button>
    </Panel>
  );
}

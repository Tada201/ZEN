import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";

interface IntelligenceSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function IntelligenceSettings({ settings, onUpdate }: IntelligenceSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Intelligence</h3>
        <p className="text-[13px] text-muted-foreground">Configure RAG, embeddings, and memory systems.</p>
      </div>

      <SettingsSection title="Retrieval" icon="lucide:search" description="Retrieval-Augmented Generation configuration">
        <SettingsRow
          label="Enable RAG"
          description="Augment prompts with retrieved context"
          control={
            <WorkbenchSwitch
              checked={settings["rag.enabled"] !== "false"}
              onCheckedChange={v => onUpdate("rag.enabled", String(v))}
            />
          }
          icon="lucide:book-open"
        />

        <SettingsRow
          label="Strict Grounding"
          description="Only answer from retrieved context"
          control={
            <WorkbenchSwitch
              checked={settings["rag.strict-grounding"] === "true"}
              onCheckedChange={v => onUpdate("rag.strict-grounding", String(v))}
            />
          }
          icon="lucide:git-branch"
        />

        <SettingsRow
          label="Show Citations"
          description="Display source references in responses"
          control={
            <WorkbenchSwitch
              checked={settings["rag.citations"] !== "false"}
              onCheckedChange={v => onUpdate("rag.citations", String(v))}
            />
          }
          icon="lucide:bookmark"
        />

        <SettingsRow
          label="Search Strategy"
          description="Method for retrieving relevant context"
          control={
            <WorkbenchSelect
              value={settings["rag.search-strategy"] || "hybrid"}
              onValueChange={v => onUpdate("rag.search-strategy", v)}
              options={[
                { value: "vector", label: "Vector Search" },
                { value: "hybrid", label: "Hybrid Search" },
                { value: "semantic", label: "Semantic Search" },
              ]}
              width={140}
            />
          }
          icon="lucide:search"
        />

        <SettingsRow
          label="Top-K Results"
          description="Number of documents to retrieve"
          control={
            <WorkbenchSelect
              value={settings["rag.top-k"] || "5"}
              onValueChange={v => onUpdate("rag.top-k", v)}
              options={[3, 5, 10, 15, 20].map(n => ({ value: String(n), label: String(n) }))}
              width={100}
            />
          }
          icon="lucide:layers"
        />
      </SettingsSection>

      <SettingsSection title="Embeddings" icon="lucide:brain" description="Document vectorization settings">
        <SettingsRow
          label="Embedding Model"
          description="Model used to generate document vectors"
          control={
            <WorkbenchSelect
              value={settings["embeddings.model"] || "nomic"}
              onValueChange={v => onUpdate("embeddings.model", v)}
              options={[
                { value: "nomic", label: "Nomic Embed Text" },
                { value: "openai", label: "OpenAI Ada 002" },
                { value: "cohere", label: "Cohere Embed" },
                { value: "nine_router", label: "9Router Embedding" },
              ]}
              width={140}
            />
          }
          icon="lucide:database"
        />

        <SettingsRow
          label="Chunk Size"
          description="Maximum tokens per document chunk"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
                value={[parseInt(settings["embeddings.chunk-size"] || "512")]}
                onValueChange={([v]) => onUpdate("embeddings.chunk-size", String(v))}
                min={128}
                max={2048}
                step={128}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                {settings["embeddings.chunk-size"] || "512"}
              </span>
            </div>
          }
          icon="lucide:layers"
        />

        <SettingsRow
          label="Chunk Overlap"
          description="Token overlap between consecutive chunks"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
                value={[parseInt(settings["embeddings.chunk-overlap"] || "64")]}
                onValueChange={([v]) => onUpdate("embeddings.chunk-overlap", String(v))}
                min={0}
                max={512}
                step={32}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right font-mono">
                {settings["embeddings.chunk-overlap"] || "64"}
              </span>
            </div>
          }
          icon="lucide:git-branch"
        />
      </SettingsSection>

      <SettingsSection title="Memory" icon="lucide:library" description="Conversation context management">
        <SettingsRow
          label="Session Memory"
          description="Remember context across conversation turns"
          control={
            <WorkbenchSwitch
              checked={settings["memory.enabled"] !== "false"}
              onCheckedChange={v => onUpdate("memory.enabled", String(v))}
            />
          }
          icon="lucide:book-open"
        />

        <SettingsRow
          label="Max Turns"
          description="Number of previous turns to retain"
          control={
            <WorkbenchSelect
              value={settings["memory.max-turns"] || "20"}
              onValueChange={v => onUpdate("memory.max-turns", v)}
              options={[10, 20, 50, 100].map(n => ({ value: String(n), label: String(n) }))}
              width={100}
            />
          }
          icon="lucide:layers"
        />
      </SettingsSection>
    </div>
  );
}

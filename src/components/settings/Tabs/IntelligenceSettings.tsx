import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { SECRET_PRESENT_VALUE } from "@/api/settingsApi";

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

      <SettingsSection title="Web Search" icon="lucide:globe" description="External search providers used by the web_search tool">
        <SettingsRow
          label="Provider Priority"
          description="Automatic uses Tavily, then Exa, then keyless DuckDuckGo fallback"
          control={
            <WorkbenchSelect
              value={settings.web_search_provider || "auto"}
              onValueChange={value => onUpdate("web_search_provider", value)}
              options={[
                { value: "auto", label: "Automatic" },
                { value: "tavily", label: "Tavily first" },
                { value: "exa", label: "Exa first" },
                { value: "duckduckgo", label: "DuckDuckGo only" },
              ]}
              width={160}
            />
          }
          icon="lucide:route"
        />

        <SettingsRow
          label="Tavily API Key"
          description="Stored in the operating-system keyring"
          control={
            <WorkbenchInput
              type="password"
              value={settings.tavily_api_key === SECRET_PRESENT_VALUE ? "" : settings.tavily_api_key || ""}
              placeholder={settings.tavily_api_key === SECRET_PRESENT_VALUE ? "Configured" : "tvly-..."}
              onChangeText={value => onUpdate("tavily_api_key", value)}
              className="h-9 w-[220px] font-mono text-xs"
            />
          }
          icon="lucide:key-round"
        />

        <SettingsRow
          label="Exa API Key"
          description="Stored in the operating-system keyring"
          control={
            <WorkbenchInput
              type="password"
              value={settings.exa_api_key === SECRET_PRESENT_VALUE ? "" : settings.exa_api_key || ""}
              placeholder={settings.exa_api_key === SECRET_PRESENT_VALUE ? "Configured" : "exa-..."}
              onChangeText={value => onUpdate("exa_api_key", value)}
              className="h-9 w-[220px] font-mono text-xs"
            />
          }
          icon="lucide:key-round"
        />

        <SettingsRow
          label="Tavily Search Depth"
          description="Fast is the default low-latency mode; advanced costs more credits"
          control={
            <WorkbenchSelect
              value={settings.tavily_search_depth || "fast"}
              onValueChange={value => onUpdate("tavily_search_depth", value)}
              options={[
                { value: "ultra-fast", label: "Ultra fast" },
                { value: "fast", label: "Fast" },
                { value: "basic", label: "Basic" },
                { value: "advanced", label: "Advanced" },
              ]}
              width={140}
            />
          }
          icon="lucide:gauge"
        />

        <SettingsRow
          label="Maximum Results"
          description="Shared result limit for Tavily, Exa, and DuckDuckGo"
          control={
            <WorkbenchSelect
              value={settings.web_search_max_results || "10"}
              onValueChange={value => onUpdate("web_search_max_results", value)}
              options={[5, 8, 10, 15, 20].map(value => ({ value: String(value), label: String(value) }))}
              width={100}
            />
          }
          icon="lucide:list-ordered"
        />
      </SettingsSection>

      <SettingsSection title="Embeddings" icon="lucide:brain" description="Document vectorization settings">
        <SettingsRow
          label="Embedding Model"
          description="Coming soon — vector embedding models are not yet selectable. Default is configured internally."
          control={
            <WorkbenchSelect
              value="nomic"
              options={[{ value: "nomic", label: "No model available", disabled: true }]}
              width={140}
              className="opacity-50 pointer-events-none"
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

        <SettingsRow
          label="Summarize History"
          description="Compress older messages in background using an LLM"
          control={
            <WorkbenchSwitch
              checked={settings["memory.summarization_enabled"] !== "false"}
              onCheckedChange={v => onUpdate("memory.summarization_enabled", String(v))}
            />
          }
          icon="lucide:compress"
        />

        {settings["memory.summarization_enabled"] !== "false" && (
          <SettingsRow
            label="Summarization Model"
            description="Lighter model to generate conversation summaries"
            control={
              <WorkbenchSelect
                value={settings["memory.summarization_model"] || "llama3.2:1b"}
                onValueChange={v => onUpdate("memory.summarization_model", v)}
                options={[
                  { value: "llama3.2:1b", label: "Llama 3.2 1B (Recommended)" },
                  { value: "llama3.2:3b", label: "Llama 3.2 3B" },
                  { value: "llama3:8b", label: "Llama 3 8B" },
                  { value: "phi3:3.8b", label: "Phi 3 3.8B" },
                  { value: "gemma2:2b", label: "Gemma 2 2B" },
                ]}
                width={200}
              />
            }
            icon="lucide:cpu"
          />
        )}

        <SettingsRow
          label="Semantic Recall"
          description="Retrieve relevant context from previous chats using vector memory"
          control={
            <WorkbenchSwitch
              checked={settings["memory.semantic_recall_enabled"] !== "false"}
              onCheckedChange={v => onUpdate("memory.semantic_recall_enabled", String(v))}
            />
          }
          icon="lucide:brain"
        />

        {settings["memory.semantic_recall_enabled"] !== "false" && (
          <SettingsRow
            label="Max Recalled Messages"
            description="Maximum number of historical matching messages to recall"
            control={
              <div className="flex items-center gap-2 w-[140px]">
                <WorkbenchSlider
                  value={[parseInt(settings["memory.max_recalled_messages"] || "5")]}
                  onValueChange={([v]) => onUpdate("memory.max_recalled_messages", String(v))}
                  min={1}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-[11px] font-mono text-muted-foreground w-6 text-right">
                  {settings["memory.max_recalled_messages"] || "5"}
                </span>
              </div>
            }
            icon="lucide:layers"
          />
        )}

        <SettingsRow
          label="Drift Threshold"
          description="Similarity score lower bound before triggering drift alert"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
                value={[parseFloat(settings["memory.drift_threshold"] || "0.3")]}
                onValueChange={([v]) => onUpdate("memory.drift_threshold", String(v))}
                min={0.1}
                max={0.8}
                step={0.05}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                {parseFloat(settings["memory.drift_threshold"] || "0.3").toFixed(2)}
              </span>
            </div>
          }
          icon="lucide:alert-circle"
        />
      </SettingsSection>
    </div>
  );
}

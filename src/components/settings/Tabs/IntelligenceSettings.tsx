import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Brain, Search, Library, BookOpen,
  Layers, Bookmark, GitBranch, Database
} from "lucide-react";

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

      <SettingsSection title="Retrieval" icon={Search} description="Retrieval-Augmented Generation configuration">
        <SettingsRow
          label="Enable RAG"
          description="Augment prompts with retrieved context"
          control={
            <Switch
              checked={settings["rag.enabled"] !== "false"}
              onCheckedChange={v => onUpdate("rag.enabled", String(v))}
            />
          }
          icon={BookOpen}
        />

        <SettingsRow
          label="Strict Grounding"
          description="Only answer from retrieved context"
          control={
            <Switch
              checked={settings["rag.strict-grounding"] === "true"}
              onCheckedChange={v => onUpdate("rag.strict-grounding", String(v))}
            />
          }
          icon={GitBranch}
        />

        <SettingsRow
          label="Show Citations"
          description="Display source references in responses"
          control={
            <Switch
              checked={settings["rag.citations"] !== "false"}
              onCheckedChange={v => onUpdate("rag.citations", String(v))}
            />
          }
          icon={Bookmark}
        />

        <SettingsRow
          label="Search Strategy"
          description="Method for retrieving relevant context"
          control={
            <Select value={settings["rag.search-strategy"] || "hybrid"} onValueChange={v => onUpdate("rag.search-strategy", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vector">Vector Search</SelectItem>
                <SelectItem value="hybrid">Hybrid Search</SelectItem>
                <SelectItem value="semantic">Semantic Search</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Search}
        />

        <SettingsRow
          label="Top-K Results"
          description="Number of documents to retrieve"
          control={
            <Select value={settings["rag.top-k"] || "5"} onValueChange={v => onUpdate("rag.top-k", v)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 10, 15, 20].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          icon={Layers}
        />
      </SettingsSection>

      <SettingsSection title="Embeddings" icon={Brain} description="Document vectorization settings">
        <SettingsRow
          label="Embedding Model"
          description="Model used to generate document vectors"
          control={
            <Select value={settings["embeddings.model"] || "nomic"} onValueChange={v => onUpdate("embeddings.model", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nomic">Nomic Embed Text</SelectItem>
                <SelectItem value="openai">OpenAI Ada 002</SelectItem>
                <SelectItem value="cohere">Cohere Embed</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Database}
        />

        <SettingsRow
          label="Chunk Size"
          description="Maximum tokens per document chunk"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Slider
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
          icon={Layers}
        />

        <SettingsRow
          label="Chunk Overlap"
          description="Token overlap between consecutive chunks"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Slider
                value={[parseInt(settings["embeddings.chunk-overlap"] || "64")]}
                onValueChange={([v]) => onUpdate("embeddings.chunk-overlap", String(v))}
                min={0}
                max={512}
                step={32}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                {settings["embeddings.chunk-overlap"] || "64"}
              </span>
            </div>
          }
          icon={GitBranch}
        />
      </SettingsSection>

      <SettingsSection title="Memory" icon={Library} description="Conversation context management">
        <SettingsRow
          label="Session Memory"
          description="Remember context across conversation turns"
          control={
            <Switch
              checked={settings["memory.enabled"] !== "false"}
              onCheckedChange={v => onUpdate("memory.enabled", String(v))}
            />
          }
          icon={BookOpen}
        />

        <SettingsRow
          label="Max Turns"
          description="Number of previous turns to retain"
          control={
            <Select value={settings["memory.max-turns"] || "20"} onValueChange={v => onUpdate("memory.max-turns", v)}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          icon={Layers}
        />
      </SettingsSection>
    </div>
  );
}

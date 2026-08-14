import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Calculator,
  Cpu,
  FileSearch,
  FileText,
  Files,
  FolderTree,
  Globe,
  ListChecks,
  MapPin,
  Radar,
  Route,
  type LucideIcon,
} from "lucide-react";
import type { ToolCall } from "../../types";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { EarthquakeList, AircraftList, RouteCard, GeocodeList } from "./OsintRenderers";
import { SystemMetricsCard } from "./SystemMetricsCard";
import { CalculatorCard } from "./CalculatorCard";
import { TodosCard } from "./TodosCard";
import { DocumentList, DirectoryList, DocumentContent, GrepResults } from "./DocumentRenderers";

/**
 * Context handed to every identity-based renderer.
 * - `input`  — parsed tool arguments (already de-stringified by ToolDetailView).
 * - `output` — parsed tool result JSON (object, array, or primitive).
 * - `outputPreview` — the shape-normalized preview, for renderers that want to
 *   reuse the generic extraction (e.g. geocode leaning on `results`).
 */
export interface RendererContext {
  input: Record<string, unknown>;
  output: unknown;
  outputPreview: ToolOutputPreview;
  toolCall: ToolCall;
}

export interface ToolRenderer {
  icon: LucideIcon;
  /** Returns the card, or `null` when the output lacks expected keys so the
   *  caller falls through to the shape-based default. */
  render: (ctx: RendererContext) => ReactNode;
}

/**
 * Identity-keyed renderer registry. Keys are backend tool ids. Aliases that the
 * backend itself treats as equivalent (`system_metrics`/`get_system_metrics`)
 * are registered as separate entries pointing at the same renderer.
 */
const RENDERERS: Record<string, ToolRenderer> = {
  get_earthquakes: { icon: Activity, render: EarthquakeList },
  get_military_aircraft: { icon: Radar, render: AircraftList },
  calculate_route: { icon: Route, render: RouteCard },
  geocode_search: { icon: MapPin, render: GeocodeList },
  reverse_geocode: { icon: MapPin, render: GeocodeList },
  get_system_metrics: { icon: Cpu, render: SystemMetricsCard },
  system_metrics: { icon: Cpu, render: SystemMetricsCard },
  calculator: { icon: Calculator, render: CalculatorCard },
  write_todos: { icon: ListChecks, render: TodosCard },
  list_documents: { icon: Files, render: DocumentList },
  list_directory: { icon: FolderTree, render: DirectoryList },
  read_document_content: { icon: FileText, render: DocumentContent },
  grep_documents: { icon: FileSearch, render: GrepResults },
  search_files: { icon: FileSearch, render: GrepResults },
};

/** Fallback icons for tools without a full renderer, keyed by name family. */
const ICON_FALLBACKS: Record<string, LucideIcon> = {
  web_search: Globe,
  web_fetch: Globe,
  spawn_agent: Bot,
};

function canonicalToolName(name: string, input?: Record<string, unknown>): string {
  const normalized = name.trim().toLowerCase();
  if (normalized !== "tool_exec" && normalized !== "tool-exec" && normalized !== "execute_tool") {
    return normalized;
  }

  const nested = input?.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
    ? input.arguments as Record<string, unknown>
    : undefined;
  const candidate = input?.tool_id || input?.toolId || input?.tool || input?.name
    || nested?.tool_id || nested?.toolId || nested?.tool || nested?.name;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim().toLowerCase() : normalized;
}

/** Resolve aliases and tool_exec envelopes before choosing a specialized view. */
export function getToolRenderer(name: string, input?: Record<string, unknown>): ToolRenderer | undefined {
  return RENDERERS[canonicalToolName(name, input)];
}

export function getToolIcon(name: string, input?: Record<string, unknown>): LucideIcon | undefined {
  const canonical = canonicalToolName(name, input);
  return RENDERERS[canonical]?.icon ?? ICON_FALLBACKS[canonical];
}

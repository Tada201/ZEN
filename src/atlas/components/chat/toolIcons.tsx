import { Cpu, type LucideIcon } from "lucide-react";
import { getToolIcon } from "./tool/renderers/registry";

/**
 * Resolve a tool's icon by name. Backed by the per-tool renderer registry
 * (single source of truth); falls back to a neutral chip icon for tools
 * without a registered renderer or icon family.
 */
export function toolIcon(name: string): LucideIcon {
  return getToolIcon(name) ?? Cpu;
}

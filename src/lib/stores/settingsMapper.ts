import { SettingsSchema, type ValidatedSettings } from "./settings/schema";
import { z } from "zod";

/**
 * Bidirectional mapper between frontend camelCase settings state
 * and backend SQLite snake_case keys.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────

const camelToSnake = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

// ─── Overrides ────────────────────────────────────────────────────────────

const SNAKE_OVERRIDES: Record<string, string> = {
  // If frontend key doesn't match the SQLite column name, add override here
  memoryEnabled: "memory.enabled",
  memoryMaxTurns: "memory.max-turns",
  memorySummarizationEnabled: "memory.summarization_enabled",
  memorySummarizationModel: "memory.summarization_model",
  memorySemanticRecallEnabled: "memory.semantic_recall_enabled",
  memoryMaxRecalledMessages: "memory.max_recalled_messages",
  memoryDriftDetectionEnabled: "memory.drift_detection_enabled",
  memoryDriftThreshold: "memory.drift_threshold",
};

const FIELD_TYPES: Record<string, "string" | "boolean" | "number" | "json"> = {};

// Build field type map from the Zod schema
const buildFieldTypes = () => {
  const shape = SettingsSchema.shape;
  for (const [key, schema] of Object.entries(shape)) {
    if (schema instanceof z.ZodDefault) {
      // Unwrap default to get inner type
      const inner = schema._def.innerType;
      FIELD_TYPES[key] = inferZodType(inner);
    } else {
      FIELD_TYPES[key] = inferZodType(schema);
    }
  }
};

const inferZodType = (schema: z.ZodTypeAny): "string" | "boolean" | "number" | "json" => {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodEnum) return "string";
  if (
    schema instanceof z.ZodObject ||
    schema instanceof z.ZodArray ||
    schema instanceof z.ZodRecord
  )
    return "json";
  return "string";
};

buildFieldTypes();

// ─── Mapping Rules ────────────────────────────────────────────────────────

export interface MappingRule {
  sqliteKey: string;
  type: "string" | "boolean" | "number" | "json";
}

export const MAPPING_RULES: Record<string, MappingRule> = {};

for (const key of Object.keys(SettingsSchema.shape)) {
  MAPPING_RULES[key] = {
    sqliteKey: SNAKE_OVERRIDES[key] ?? camelToSnake(key),
    type: FIELD_TYPES[key] ?? "string",
  };
}

// ─── Type Coercion ────────────────────────────────────────────────────────

export const coerce = (value: string, type: "string" | "boolean" | "number" | "json"): unknown => {
  switch (type) {
    case "boolean":
      return value === "true" || value === "1";
    case "number":
      return Number(value);
    case "json":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    case "string":
    default:
      return value;
  }
};

export const serialize = (value: unknown, type: "string" | "boolean" | "number" | "json"): string => {
  switch (type) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return String(value);
    case "json":
      return JSON.stringify(value);
    case "string":
    default:
      return String(value ?? "");
  }
};

// ─── Bulk Mappers ─────────────────────────────────────────────────────────

export const mapSqliteToState = (
  sqliteData: Record<string, string>
): Partial<ValidatedSettings> => {
  const state: Record<string, unknown> = {};

  for (const [sqliteKey, rawValue] of Object.entries(sqliteData)) {
    // Find matching frontend key
    const frontendKey = Object.entries(MAPPING_RULES).find(
      ([, rule]) => rule.sqliteKey === sqliteKey
    )?.[0];

    if (!frontendKey) continue;

    state[frontendKey] = coerce(rawValue, MAPPING_RULES[frontendKey].type);
  }

  return state as Partial<ValidatedSettings>;
};

export const mapStateToSqlite = (
  state: Record<string, unknown>
): Record<string, string> => {
  const sqlite: Record<string, string> = {};

  for (const [key, value] of Object.entries(state)) {
    const rule = MAPPING_RULES[key];
    if (!rule) continue;
    sqlite[rule.sqliteKey] = serialize(value, rule.type);
  }

  return sqlite;
};

export function parseStructuredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim()) return "";
  try { return JSON.parse(value); } catch { return value; }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function formatStructuredValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function redactStructuredValue(value: unknown): string {
  return formatStructuredValue(value).replace(
    /(\"(?:[^\"]*(?:api[_-]?key|authorization|bearer|credential|password|secret|token)[^\"]*)\"\s*:\s*)\"[^\"]*\"/gi,
    '$1"[redacted]"',
  );
}

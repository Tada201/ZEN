const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|authorization|bearer|credential|password|secret|token)/i;

/** Redact credential-shaped values before tool text is rendered or copied. */
export function redactToolText(value: string): string {
  let redacted = value.replace(
    /(authorization\s*:\s*bearer\s+)(["'])([^"']*)\2/gi,
    "$1$2[redacted]$2",
  );
  redacted = redacted.replace(
    /(authorization\s*:\s*bearer\s+)([^\s,;}\]]+)/gi,
    "$1[redacted]",
  );
  redacted = redacted.replace(
    new RegExp(`((?:["']?${SECRET_KEY_PATTERN.source}["']?)\\s*[:=]\\s*)(["'])([\\s\\S]*?)\\2`, "gi"),
    "$1$2[redacted]$2",
  );
  return redacted.replace(
    new RegExp(`((?:["']?${SECRET_KEY_PATTERN.source}["']?)\\s*[:=]\\s*)([^\\s,;"'}\\]\\)]+)`, "gi"),
    "$1[redacted]",
  );
}

/**
 * Convert a backend failure into a calm user-facing summary. Raw provider
 * errors often contain stack frames, request bodies, or environment details;
 * those belong behind a diagnostic surface, not in the normal chat bubble.
 */
export function sanitizeAssistantError(value: string): string {
  const redacted = redactToolText(value || "")
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^at\\s+/i.test(line))
    .join(" ")
    .replace(/\\s+/g, " ")
    .trim();
  if (!redacted) return "The agent stopped unexpectedly.";
  if (/api[_-]?key|authorization|invalid[_ -]?api|authentication|unauthorized/i.test(redacted)) {
    return "The provider could not authenticate the request.";
  }
  if (/timeout|timed out|deadline/i.test(redacted)) return "The operation timed out before it completed.";
  if (/cancel|abort|stopped/i.test(redacted)) return "The operation was stopped before it completed.";
  if (/permission|denied|forbidden/i.test(redacted)) return "The operation was blocked by permissions.";
  if (/network|connect|fetch|offline|unreachable/i.test(redacted)) return "The connection failed while the agent was running.";
  return redacted.length > 280 ? `${redacted.slice(0, 279)}…` : redacted;
}

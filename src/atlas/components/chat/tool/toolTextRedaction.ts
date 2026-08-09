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

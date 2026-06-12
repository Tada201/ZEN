export interface ToolProtocolFilterResult {
  visible: string;
  pending: string;
}

function isToolProtocolFence(fence: string): boolean {
  const firstNewline = fence.indexOf("\n");
  if (firstNewline === -1) return false;
  const tag = fence.slice(3, firstNewline).trim().toLowerCase();
  if (tag && tag !== "json" && tag !== "tool") return false;

  const body = fence.slice(firstNewline + 1, fence.endsWith("```") ? -3 : undefined).trim();
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof value.tool === "string" &&
      (value.args === undefined || (typeof value.args === "object" && value.args !== null))
    );
  } catch {
    return false;
  }
}

function trailingFencePrefix(text: string): string {
  if (text.endsWith("``")) return "``";
  if (text.endsWith("`")) return "`";
  return "";
}

export function filterToolProtocolStream(delta: string, pending = ""): ToolProtocolFilterResult {
  const input = pending + delta;
  let visible = "";
  let cursor = 0;

  while (cursor < input.length) {
    const start = input.indexOf("```", cursor);
    if (start === -1) {
      const remainder = input.slice(cursor);
      const trailing = trailingFencePrefix(remainder);
      visible += trailing ? remainder.slice(0, -trailing.length) : remainder;
      return { visible, pending: trailing };
    }

    visible += input.slice(cursor, start);
    const end = input.indexOf("```", start + 3);
    if (end === -1) return { visible, pending: input.slice(start) };

    const fence = input.slice(start, end + 3);
    if (!isToolProtocolFence(fence)) visible += fence;
    cursor = end + 3;
  }

  return { visible, pending: "" };
}

export function stripToolProtocolText(text: string): string {
  const filtered = filterToolProtocolStream(text);
  if (!filtered.pending) return filtered.visible;
  return isToolProtocolFence(filtered.pending) ? filtered.visible : filtered.visible + filtered.pending;
}

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

function trailingXmlTagPrefix(text: string): string {
  const lastLt = text.lastIndexOf("<");
  if (lastLt === -1) return "";
  const suffix = text.slice(lastLt).toLowerCase();
  const target = "<tool_call>";
  if (target.startsWith(suffix) && suffix !== target) {
    return text.slice(lastLt);
  }
  return "";
}

export function filterToolProtocolStream(delta: string, pending = ""): ToolProtocolFilterResult {
  const input = pending + delta;
  let visible = "";
  let cursor = 0;

  while (cursor < input.length) {
    const lowerInput = input.toLowerCase();
    const startMd = input.indexOf("```", cursor);
    const startXml = lowerInput.indexOf("<tool_call>", cursor);

    if (startMd === -1 && startXml === -1) {
      const remainder = input.slice(cursor);
      const trailingMd = trailingFencePrefix(remainder);
      const trailingXml = trailingXmlTagPrefix(remainder);
      const trailing = trailingMd.length > trailingXml.length ? trailingMd : trailingXml;

      visible += trailing ? remainder.slice(0, -trailing.length) : remainder;
      return { visible, pending: trailing };
    }

    const isMdFirst = startMd !== -1 && (startXml === -1 || startMd < startXml);

    if (isMdFirst) {
      visible += input.slice(cursor, startMd);
      const end = input.indexOf("```", startMd + 3);
      if (end === -1) return { visible, pending: input.slice(startMd) };

      const fence = input.slice(startMd, end + 3);
      if (!isToolProtocolFence(fence)) visible += fence;
      cursor = end + 3;
    } else {
      visible += input.slice(cursor, startXml);
      const end = lowerInput.indexOf("</tool_call>", startXml + 11);
      if (end === -1) return { visible, pending: input.slice(startXml) };

      cursor = end + 12;
    }
  }

  return { visible, pending: "" };
}

export function stripToolProtocolText(text: string): string {
  const filtered = filterToolProtocolStream(text);
  if (!filtered.pending) return filtered.visible;

  const lowerPending = filtered.pending.toLowerCase();
  const isXml = lowerPending.startsWith("<tool_call") || (lowerPending.startsWith("<") && "<tool_call>".startsWith(lowerPending));
  if (isXml || isToolProtocolFence(filtered.pending)) {
    return filtered.visible;
  }
  return filtered.visible + filtered.pending;
}

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
      ((typeof value.tool === "string" && typeof value.args === "object" && value.args !== null) ||
       (typeof value.name === "string" && typeof value.arguments === "object" && value.arguments !== null))
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
      if (end === -1) {
        // Safety valve: don't buffer indefinitely if missing closing fence
        if (input.length - startMd > 2000) {
          visible += input.slice(startMd, startMd + 3);
          cursor = startMd + 3;
          continue;
        }
        return { visible, pending: input.slice(startMd) };
      }

      const fence = input.slice(startMd, end + 3);
      if (!isToolProtocolFence(fence)) visible += fence;
      cursor = end + 3;
    } else {
      visible += input.slice(cursor, startXml);
      const end = lowerInput.indexOf("</tool_call>", startXml + 11);
      if (end === -1) {
        // Safety valve: don't buffer indefinitely if missing closing xml
        if (input.length - startXml > 2000) {
          visible += input.slice(startXml, startXml + 11);
          cursor = startXml + 11;
          continue;
        }
        return { visible, pending: input.slice(startXml) };
      }

      cursor = end + 12;
    }
  }

  return { visible, pending: "" };
}

export function stripToolProtocolText(text: string): string {
  let result = text;

  // 1. Strip closed markdown tool blocks
  result = result.replace(/```(?:json|tool)?\s*\{[\s\S]*?\}\s*```/ig, (match) => {
    return isToolProtocolFence(match) ? "" : match;
  });

  // 2. Strip unclosed markdown tool blocks at the very end. Require BOTH a
  //    name/tool key AND an args/arguments key so legitimate JSON examples that
  //    merely contain a "name" field (config/API docs) are not swallowed.
  result = result.replace(/```(?:json|tool)?\s*\{[^`]*$/i, (match) => {
    const hasName = match.includes('"tool"') || match.includes('"name"');
    const hasArgs = match.includes('"args"') || match.includes('"arguments"');
    if (hasName && hasArgs) return "";
    return match;
  });

  // 3. Strip closed XML blocks
  result = result.replace(/<tool_call>[\s\S]*?<\/tool_call>/ig, "");

  // 4. Strip unclosed XML blocks at the very end
  result = result.replace(/<tool_call>[\s\S]*$/i, (match) => {
    // Only strip if it's mostly JSON. If there's lots of normal text after it, 
    // we don't want to swallow the user's answer.
    const hasManyWords = match.split(/\s+/).length > 20;
    if (!match.includes('}') && hasManyWords) {
      // Looks like broken XML followed by text, just strip the tag itself
      return match.replace(/<tool_call>/i, "");
    }
    // Safe to strip the trailing incomplete tool call
    return "";
  });

  // 5. Clean up any leftover `<tool_call>` tags that were orphaned
  result = result.replace(/<tool_call>/ig, "");

  return result.trim();
}

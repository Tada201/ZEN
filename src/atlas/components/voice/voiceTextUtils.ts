// Strip markdown syntax and tool execution metadata before TTS readback.
export function stripMarkdown(text: string) {
    if (!text) return '';
    
    let stripped = text;

    // 1. Strip thinking blocks completely
    stripped = stripped.replace(/<think>[\s\S]*?<\/think>/gi, '');
    stripped = stripped.replace(/<thought>[\s\S]*?<\/thought>/gi, '');

    // 2. Strip tool call / artifact XML blocks completely
    stripped = stripped.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
    stripped = stripped.replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/gi, '');
    stripped = stripped.replace(/<boltAction[\s\S]*?<\/boltAction>/gi, '');
    stripped = stripped.replace(/<nexus_artifact[\s\S]*?<\/nexus_artifact>/gi, '');
    stripped = stripped.replace(/<card[\s\S]*?<\/card>/gi, '');
    stripped = stripped.replace(/<svg\b[\s\S]*?(?:<\/svg>|$)/gi, '');
    stripped = stripped.replace(/&lt;svg\b[\s\S]*?(?:&lt;\/svg&gt;|$)/gi, '');

    // 3. Strip tool execution trace lines (common patterns in agentic chat)
    stripped = stripped.replace(/^(?:Running|Searching|Reading|Writing|Executing)\s.*$/gim, '');
    stripped = stripped.replace(/^(?:Tool execution|Parallel tool execution|Batch started).*$/gim, '');
    stripped = stripped.replace(/^\d+\s+(?:running|waiting|failed|done).*$/gim, '');
    stripped = stripped.replace(/^Used\s+[\w_]+\s*(?:completed|failed)?$/gim, '');
    stripped = stripped.replace(/^\d+\s+(?:results?|files?|file)\s*(?:changed)?$/gim, '');
    stripped = stripped.replace(/^Tool\s+(?:list|info|execution).*?(?:\bID\s+call_[\w-]+|\bcall_[\w-]+).*$/gim, '');
    stripped = stripped.replace(/\bcall_[a-z0-9_-]+\b/gi, '');

    // 4. Strip code blocks completely
    stripped = stripped.replace(/```[\s\S]*?(?:```|$)/g, '');

    // Remove standalone tool envelopes and code-like payload lines. These can
    // arrive unfenced or partially streamed by providers with weak tool mode.
    stripped = stripped.replace(/^\s*\{?\s*"?(?:tool|tool_id|arguments|args|tool_call_id)"?\s*:[\s\S]*$/gim, '');
    stripped = stripped.replace(/^\s*(?:<\/?(?:svg|path|circle|rect|line|polyline|polygon|g)\b|(?:const|let|var|function|class)\s+|[{}\[\]]\s*$).*$/gim, '');

    // 5. Strip JSON blocks (tool input/output)
    stripped = stripped.replace(/\{[\s\S]*?\}/g, (match) => {
        // Only strip if it looks like structured JSON (has colons and quotes)
        if (/"[^"]+"\s*:/.test(match) && match.length > 20) return '';
        return match;
    });

    // 6. Strip Markdown tables (lines containing pipes)
    stripped = stripped.replace(/(?:^|\n)(?:\s*\|.*\|\s*\n?)+/g, '\n');

    // 7. Clean up inline markdown formatting and URLs
    stripped = stripped
        .replace(/https?:\/\/\S+/gi, '') // Plain URLs
        .replace(/www\.\S+/gi, '') // www. links
        .replace(/[\/\\][\w\-\.]+[\/\\][\w\-\.\/\\]+/g, '') // File paths
        .replace(/\.(com|org|net|io|dev|app|ai)\/\S*/gi, '') // Domain tail URLs
        .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, '') // Timestamps like 00:01:23
        .replace(/\[\d+\]/g, '') // Strip citations
        .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
        .replace(/\*(.*?)\*/g, '$1') // Italic
        .replace(/`(.*?)`/g, '$1') // Inline code
        .replace(/#+\s/g, '') // Headings
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
        .replace(/<.*?>/g, '') // Any remaining standalone tags
        .replace(/\n/g, ' ') // Convert newlines to spaces
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
        .trim();

    return stripped;
}

export function isSpeakableVoiceText(text: string) {
    const candidate = text.trim();
    if (!candidate) return false;
    if (/\b(?:tool_call_id|tool_id|call_[a-z0-9_-]+)\b/i.test(candidate)) return false;
    if (/<\/?(?:svg|path|circle|rect|line|polyline|polygon|g)\b/i.test(candidate)) return false;
    if (/^\s*[<{\[]/.test(candidate) && /[>}:\]]/.test(candidate)) return false;
    if (/"(?:tool|arguments|args|action|blocks?|markup)"\s*:/i.test(candidate)) return false;
    return /[a-z0-9]/i.test(candidate);
}

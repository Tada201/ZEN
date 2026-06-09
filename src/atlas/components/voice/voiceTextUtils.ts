// Strip markdown syntax before showing model output as voice captions.
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

    // 3. Strip code blocks completely
    stripped = stripped.replace(/```[\s\S]*?```/g, '');

    // 4. Strip Markdown tables (lines containing pipes)
    // Matches contiguous lines that contain a pipe character typical of tables
    stripped = stripped.replace(/(?:^|\n)(?:\s*\|.*\|\s*\n?)+/g, '\n');

    // 5. Clean up inline markdown formatting
    stripped = stripped
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

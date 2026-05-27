// Strip markdown syntax before showing model output as voice captions.
export function stripMarkdown(text: string) {
    if (!text) return '';
    const codeBlocks: string[] = [];
    let stripped = text.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match.replace(/^```\w*\n?/, '').replace(/\n?```$/, ''));
        return `\x00CB${codeBlocks.length - 1}\x00`;
    });
    stripped = stripped
        .replace(/\[\d+\]/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/<.*?>/g, '')
        .replace(/\n/g, ' ')
        .trim();
    stripped = stripped.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
    return stripped;
}

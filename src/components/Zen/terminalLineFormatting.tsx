import type { ReactNode } from 'react';

export function renderFormattedTerminalLine(line: string): ReactNode {
    if (line.startsWith('[SYSTEM]')) {
        return (
            <span className="text-primary font-mono tracking-wider font-semibold">
                {line}
            </span>
        );
    }
    if (line.startsWith('[ERROR]')) {
        return (
            <span className="text-destructive font-mono font-semibold">
                {line}
            </span>
        );
    }
    if (line.startsWith('$ ')) {
        const cmd = line.slice(2);
        return (
            <span className="font-mono">
                <span className="text-primary/70 font-semibold">$</span>{' '}
                <span className="text-foreground font-bold">{cmd}</span>
            </span>
        );
    }

    const words = line.split(/(\s+)/);
    return words.map((word, idx) => {
        const lword = word.toLowerCase();
        if (lword.includes('success') || lword.includes('succeeded') || lword.includes('stable')) {
            return <span key={idx} className="text-success font-bold">{word}</span>;
        }
        if (lword.includes('fail') || lword.includes('failed') || lword.includes('error')) {
            return <span key={idx} className="text-destructive font-bold">{word}</span>;
        }
        if (lword.includes('warn') || lword.includes('warning') || lword.includes('alert')) {
            return <span key={idx} className="text-warning font-semibold">{word}</span>;
        }
        if (lword.includes('info') || lword.includes('debug')) {
            return <span key={idx} className="text-muted-foreground/80">{word}</span>;
        }
        if (lword.startsWith('http://') || lword.startsWith('https://')) {
            return <span key={idx} className="text-primary underline cursor-pointer hover:opacity-85">{word}</span>;
        }
        return <span key={idx} className="text-foreground/80">{word}</span>;
    });
}

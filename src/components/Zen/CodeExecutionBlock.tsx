import React, { useMemo } from 'react';
import Prism from 'prismjs';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Terminal, Play, RotateCcw } from 'lucide-react';

interface CodeExecutionBlockProps {
    code: string;
    language: string;
    output?: string;
    error?: string;
    isRunning?: boolean;
    executionTime?: number;
    exitCode?: number;
    onRerun?: () => void;
}

export function CodeExecutionBlock({
    code,
    language,
    output,
    error,
    isRunning = false,
    executionTime,
    exitCode = 0,
    onRerun
}: CodeExecutionBlockProps) {
    const highlightedCode = useMemo(() => {
        return Prism.highlight(
            code,
            Prism.languages[language] || Prism.languages.javascript,
            language
        );
    }, [code, language]);

    return (
        <div className={cn('card overflow-hidden my-6')}>
            <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-primary opacity-60" />
                    <span className="text-[10px] font-bold tracking-widest text-primary uppercase">EXECUTION</span>
                    {executionTime !== undefined && (
                        <span className="text-[9px] font-mono text-muted-foreground ml-2">
                            {executionTime}ms
                        </span>
                    )}
                </div>
                {onRerun && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRerun}
                        className="press h-6 w-6 p-0"
                    >
                        <RotateCcw size={10} />
                    </Button>
                )}
            </div>
            <pre className="p-4 font-mono text-[12px] bg-card overflow-x-auto">
                <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
            </pre>
            {(output || error) && (
                <div className="p-4 border-t border-border bg-muted/30 font-mono text-[11px]">
                    {output && (
                        <div className="text-[hsl(160_84%_39%)]">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-widest mr-2">OUTPUT:</span>
                            {output}
                        </div>
                    )}
                    {error && (
                        <div className="text-destructive">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-widest mr-2">ERROR:</span>
                            {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
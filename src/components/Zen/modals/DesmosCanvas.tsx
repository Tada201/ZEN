import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCcw, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/style';
import { useSessionStore } from '../../../lib/stores/sessionStore';

declare global {
    interface Window {
        Desmos: any;
    }
}

const DESMOS_SCRIPT = 'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dcba9e7c254d7e6';
const MAX_RETRIES = 3;

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
let globalState: LoadState = 'idle';
let globalPromise: Promise<void> | null = null;

function loadDesmos(): Promise<void> {
    if (window.Desmos) return Promise.resolve();
    if (globalState === 'loading' && globalPromise) return globalPromise;
    if (globalState === 'loaded') return Promise.resolve();

    globalState = 'loading';
    globalPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = DESMOS_SCRIPT;
        script.async = true;
        script.onload = () => {
            globalState = window.Desmos ? 'loaded' : 'error';
            resolve();
        };
        script.onerror = () => {
            globalState = 'error';
            reject(new Error('Desmos API failed to load'));
        };
        document.head.appendChild(script);
    });
    return globalPromise;
}

export interface DesmosConfig {
    invertedColors?: boolean;
    graphpaper?: boolean;
    showGrid?: boolean;
    degreeMode?: boolean;
    polarMode?: boolean;
}

interface DesmosCanvasProps {
    config?: DesmosConfig;
    className?: string;
}

export function DesmosCanvas({ config = {}, className = '' }: DesmosCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const calculatorRef = useRef<any>(null);
    const [loadState, setLoadState] = useState<LoadState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const retryCount = useRef(0);
    const { state } = useSessionStore();

    const invertColor = (hex: string) => {
        if (hex.indexOf('#') === 0) hex = hex.slice(1);
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length !== 6) return '#000000';
        const r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16).padStart(2, '0');
        const g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16).padStart(2, '0');
        const b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const initCalculator = useCallback(() => {
        if (!containerRef.current || calculatorRef.current) return;
        try {
            calculatorRef.current = window.Desmos.GraphingCalculator(containerRef.current, {
                expressions: false,
                settingsMenu: false,
                zoomButtons: false,
                keypad: false,
                lockViewport: true,
                degreeMode: config.degreeMode ?? false,
            });
            calculatorRef.current.updateSettings({
                graphpaper: config.graphpaper ?? true,
                showGrid: config.showGrid ?? true,
                backgroundColor: config.invertedColors ? 'hsl(240 6% 8%)' : 'hsl(0 0% 98%)',
                textColor: config.invertedColors ? 'hsl(262 83% 70%)' : 'hsl(0 0% 0%)',
            });
            setIsReady(true);
        } catch (err) {
            setError(`Initialization failed: ${(err as Error).message}`);
            setIsReady(false);
        }
    }, [config]);

    const handleRetry = () => {
        if (retryCount.current >= MAX_RETRIES) return;
        retryCount.current++;
        setError(null);
        setLoadState('idle');
        globalState = 'idle';
        globalPromise = null;
    };

    useEffect(() => {
        setLoadState('loading');
        loadDesmos()
            .then(() => setLoadState('loaded'))
            .catch((err) => {
                setLoadState('error');
                setError(err.message);
            });
    }, []);

    useEffect(() => {
        if (loadState === 'loaded') {
            setTimeout(initCalculator, 100);
        }
    }, [loadState, initCalculator]);

    useEffect(() => {
        return () => {
            if (calculatorRef.current) {
                calculatorRef.current.destroy();
                calculatorRef.current = null;
            }
        };
    }, []);

    // Sync state to Desmos calculator
    useEffect(() => {
        if (!calculatorRef.current || !state) return;

        // 1. Sync Expressions
        const desmosExpressions = state.expressions.map(expr => {
            const isTable = expr.expr.trim().startsWith('table ');
            if (isTable) {
                try {
                    const tokens = expr.expr.trim().split(/\s+/);
                    const numCols = parseInt(tokens[1], 10);
                    if (isNaN(numCols) || numCols <= 0) {
                        return { id: expr.id, latex: '', hidden: true };
                    }
                    const colNames = tokens.slice(2, 2 + numCols);
                    const rawVals = tokens.slice(2 + numCols);
                    
                    const columns = colNames.map((name, colIdx) => {
                        const values: string[] = [];
                        for (let i = colIdx; i < rawVals.length; i += numCols) {
                            if (rawVals[i] !== undefined && rawVals[i] !== '') {
                                values.push(rawVals[i]);
                            }
                        }
                        return { latex: name, values };
                    });

                    return {
                        id: expr.id,
                        type: 'table',
                        columns,
                        hidden: !expr.visible
                    };
                } catch (e) {
                    console.error('Error parsing table in modal:', e);
                    return { id: expr.id, latex: '', hidden: true };
                }
            }

            return {
                id: expr.id,
                latex: expr.expr,
                color: config.invertedColors ? invertColor(expr.color || '#00FF9F') : (expr.color || '#00FF9F'),
                lineOpacity: expr.opacity || 1.0,
                lineWidth: expr.thickness || 2,
                lineStyle: expr.style === 'dashed' ? 'DASHED' : 'SOLID',
                hidden: !expr.visible
            };
        });

        // 2. Sync Variables
        const desmosVariables = Object.entries(state.variables).map(([name, value]) => ({
            id: `var_${name}`,
            latex: `${name}=${value}`,
            sliderBounds: { min: -10, max: 10, step: 0.1 }
        }));

        // 3. Sync Viewport
        if (state.viewport) {
            calculatorRef.current.setMathBounds({
                left: state.viewport.x_min,
                right: state.viewport.x_max,
                bottom: state.viewport.y_min,
                top: state.viewport.y_max
            });
        }

        calculatorRef.current.setExpressions([...desmosExpressions, ...desmosVariables]);
    }, [state, config.invertedColors]);

    const isDark = config.invertedColors ?? true;

    if (error) {
        return (
            <div className={cn(
                "flex flex-col items-center justify-center h-full bg-card border border-destructive/20 rounded-lg p-6 gap-5",
                className
            )}>
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle size={22} className="text-destructive" />
                </div>
                <div className="text-center space-y-1.5">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-foreground">Engine Failure</h3>
                    <p className="text-[10px] text-muted-foreground">{error}</p>
                    {retryCount.current > 0 && (
                        <p className="text-[9px] text-muted-foreground/50 font-mono">Retry {retryCount.current}/{MAX_RETRIES}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    {retryCount.current < MAX_RETRIES ? (
                        <Button variant="outline" size="sm" onClick={handleRetry}
                            className="h-8 gap-1.5 px-4 text-[9px] font-bold uppercase tracking-widest border-destructive/20 hover:bg-destructive/5">
                            <RefreshCcw size={10} /> Retry
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}
                            className="h-8 gap-1.5 px-4 text-[9px] font-bold uppercase tracking-widest border-primary/20 hover:bg-primary/5">
                            <Power size={10} /> Reload
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl",
            className
        )}>
            {/* Header */}
            <div className="h-9 flex items-center justify-between px-4 bg-muted/30 border-b border-border shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isReady ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-warning animate-pulse"
                    )} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">DESMOS_CALCULATOR</span>
                </div>
                <div className="flex items-center gap-1">
                    {isDark && (
                        <div className="px-2 py-0.5 rounded bg-primary/5 border border-primary/20">
                            <span className="text-[8px] font-mono text-primary/70 uppercase tracking-widest">Dark</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Calculator Container */}
            <div className="relative flex-1 bg-background">
                <div ref={containerRef} className="absolute inset-0" />

                {/* Loading Overlay */}
                {loadState !== 'loaded' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-10">
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                                <div className="w-9 h-9 border-2 border-primary/10 rounded-full" />
                                <div className="absolute inset-0 w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                            <span className="text-[9px] font-black text-primary uppercase tracking-[0.25em] animate-pulse">
                                Loading Engine...
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="h-7 flex items-center justify-between px-4 bg-muted/20 border-t border-border shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-widest">API v1.9</span>
                    <div className="w-[1px] h-2.5 bg-border" />
                    <span className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-widest">Secure_Stream</span>
                </div>
                <span className="text-[8px] font-mono text-muted-foreground/30 uppercase tracking-widest">
                    dcb31709b452b1cf9dcba9e7c254d7e6
                </span>
            </div>
        </div>
    );
}
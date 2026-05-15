import { Component, type ErrorInfo, type ReactNode } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ZEN] Render crash:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-rose-500/20 bg-slate-950 p-8 text-slate-100 shadow-2xl">
                    <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:24px_24px]" />
                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-400">
                            <WorkbenchIcon name="lucide:alert-triangle" size={24} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="text-[12px] font-black uppercase tracking-[0.22em] text-rose-300">System Fault Detected</div>
                            <div className="font-mono text-[11px] text-slate-500">ERR::RENDER_CRASH — {this.state.error?.name || 'UnknownError'}</div>
                        </div>
                        <div className="flex max-w-xl items-center gap-2 rounded-xl border border-white/5 bg-slate-900/60 px-4 py-3 text-left font-mono text-[11px] text-slate-300">
                            <WorkbenchIcon name="lucide:terminal" size={12} className="shrink-0 text-brand-purple" />
                            <span>{this.state.error?.message || 'Unknown render failure'}</span>
                        </div>
                        {this.state.errorInfo?.componentStack && (
                            <details className="w-full max-w-xl rounded-xl border border-white/5 bg-black/30 p-3 text-left">
                                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500">Component stack trace</summary>
                                <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-slate-500">{this.state.errorInfo.componentStack.slice(0, 500)}</pre>
                            </details>
                        )}
                        <WorkbenchButton onClick={this.handleRetry} variant="secondary" className="gap-2">
                            <WorkbenchIcon name="lucide:refresh-cw" size={12} />
                            Reinitialize Module
                        </WorkbenchButton>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

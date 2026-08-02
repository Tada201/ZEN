import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { listen } from '@tauri-apps/api/event';
import { terminalApi } from '@/api/terminalApi';
import '@xterm/xterm/css/xterm.css';

interface XTermSessionViewProps {
  chatId: string;
  sessionId: string;
  active: boolean;
  onError: (message: string) => void;
}

interface TerminalOutputEvent {
  sessionId: string;
  sequence: number;
  data: string;
}

const MIN_COLS = 10;
const MIN_ROWS = 5;

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Real terminal renderer. The backend owns the PTY; this component owns only xterm lifecycle. */
export function XTermSessionView({ chatId, sessionId, active, onError }: XTermSessionViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initializationFrame = 0;
    let cleanup: (() => void) | undefined;

    const initialize = () => {
      if (disposed) return;
      try {
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 2_000,
      convertEol: true,
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#09090b',
        selectionBackground: '#27272a',
        black: '#09090b',
        brightBlack: '#52525b',
        green: '#34d399',
        brightGreen: '#6ee7b7',
        cyan: '#22d3ee',
        brightCyan: '#67e8f9',
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const resize = () => {
      if (!host.offsetParent) return;
      fit.fit();
      void terminalApi.resize(chatId, sessionId, Math.max(MIN_COLS, terminal.cols), Math.max(MIN_ROWS, terminal.rows));
    };

    const outputBuffer: string[] = [];
    let replaySequence = Number.POSITIVE_INFINITY;
    let frame = 0;
    const flushOutput = () => {
      frame = 0;
      const chunk = outputBuffer.splice(0).join('');
      if (chunk) terminal.write(chunk);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    window.requestAnimationFrame(() => {
      resize();
      if (active) terminal.focus();
    });
    const input = terminal.onData((data) => {
      void terminalApi.write(chatId, sessionId, data).catch((error) => onError(getErrorMessage(error)));
    });

    const enqueueOutput = (data: string) => {
      outputBuffer.push(data);
      if (!frame) frame = window.requestAnimationFrame(flushOutput);
    };

    let unlisten: (() => void) | undefined;
    void listen<TerminalOutputEvent>('terminal:output', (event) => {
      if (event.payload.sessionId === sessionId && event.payload.sequence > replaySequence) {
        enqueueOutput(event.payload.data);
      }
    }).then(async (dispose) => {
      unlisten = dispose;
      // The shell can print its banner before this listener attaches. Drain the
      // backend-owned PTY buffer after subscribing so the first prompt is not lost.
      const initialOutput = await terminalApi.readOutput(chatId, sessionId);
      replaySequence = initialOutput.sequence;
      if (initialOutput.data) enqueueOutput(initialOutput.data);
      resize();
    }).catch((error) => onError(getErrorMessage(error)));

    const focusTerminal = () => terminal.focus();
    host.addEventListener('mousedown', focusTerminal);

    cleanup = () => {
      if (frame) window.cancelAnimationFrame(frame);
      input.dispose();
      resizeObserver.disconnect();
      unlisten?.();
      host.removeEventListener('mousedown', focusTerminal);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
      } catch (error) {
        onError(`Terminal renderer failed to initialize: ${getErrorMessage(error)}`);
      }
    };

    // Right-panel layout is animated/lazy-loaded. Give it one paint before xterm
    // measures the canvas, matching the working legacy implementation.
    initializationFrame = window.requestAnimationFrame(() => {
      window.setTimeout(initialize, 100);
    });

    return () => {
      disposed = true;
      if (initializationFrame) window.cancelAnimationFrame(initializationFrame);
      cleanup?.();
    };
  }, [chatId, onError, sessionId]);

  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    const terminal = terminalRef.current;
    if (!fit || !terminal) return;
    window.requestAnimationFrame(() => {
      fit.fit();
      terminal.focus();
      void terminalApi.resize(chatId, sessionId, Math.max(MIN_COLS, terminal.cols), Math.max(MIN_ROWS, terminal.rows));
    });
  }, [active, chatId, sessionId]);

  return <div ref={hostRef} className="h-full min-h-0 w-full p-3" aria-label="Interactive terminal" />;
}

import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { listen } from '@tauri-apps/api/event';
import { terminalApi } from '@/api/terminalApi';
import { useAnimationsEnabled } from '@/lib/motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
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

/** Longest a hidden tab's raw PTY backlog may grow between forced drains. */
const HIDDEN_FLUSH_INTERVAL_MS = 1_000;

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Real terminal renderer. The backend owns the PTY; this component owns only xterm lifecycle. */
export function XTermSessionView({ chatId, sessionId, active, onError }: XTermSessionViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Mirrors `active` for callbacks that fire outside render (the PTY output
  // listener keeps running while the tab is display:none in the workbench).
  const activeRef = useRef(active);
  activeRef.current = active;
  // Installed by the initializer; cancels the hidden-tab drain timer and
  // flushes buffered PTY output the moment the tab becomes visible.
  const activateOutputRef = useRef<(() => void) | null>(null);
  const animationsEnabled = useAnimationsEnabled();

  // xterm's cursor-blink timer runs regardless of the app motion policy, so
  // keep the option in sync with the preference (read non-reactively at
  // construction, then updated here when it changes).
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorBlink = animationsEnabled;
  }, [animationsEnabled]);

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
      cursorBlink: useSettingsStore.getState().animationsEnabled,
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

    // Debounce backend resize IPC: the right panel animates width over 300ms
    // on open/close and drag-resize fires per mousemove, so the PTY would be
    // flooded with ~18 out-of-order resizes. Local fit stays live per frame;
    // only the IPC round-trip is trailing-debounced.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const pushResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = undefined;
        const cols = Math.max(MIN_COLS, terminal.cols);
        const rows = Math.max(MIN_ROWS, terminal.rows);
        void terminalApi.resize(chatId, sessionId, cols, rows).catch(() => undefined);
      }, 80);
    };
    const resize = () => {
      // Panel transition starts at width 0 — skip until the host is visible
      // and measurable, otherwise FitAddon.fit() throws on a zero-size box.
      if (!host.offsetParent) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width <= 0 || height <= 0) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      pushResize();
    };

    const outputBuffer: string[] = [];
    let replaySequence = Number.POSITIVE_INFINITY;
    let frame = 0;
    let hiddenDrainTimer: ReturnType<typeof setTimeout> | undefined;
    const flushOutput = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
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

    // Standard terminal clipboard: copy selection / paste. xterm does not
    // intercept these by default, so bind them with a custom key handler.
    //   macOS:  Cmd+C copy (with selection), Cmd+V paste
    //   Win/Linux: Ctrl+Shift+C copy, Ctrl+Shift+V paste;
    //              Ctrl+C copies when a selection exists, otherwise passes
    //              through to the shell as SIGINT.
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    const isWindows = /Win/.test(navigator.platform || navigator.userAgent || "");
    const copySelection = () => {
      const selection = terminal.getSelection();
      if (!selection) return false;
      void navigator.clipboard.writeText(selection).catch(() => undefined);
      return true;
    };
    const pasteClipboard = () => {
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) {
            void terminalApi.write(chatId, sessionId, text).catch((error) => onError(getErrorMessage(error)));
          }
        })
        .catch(() => undefined);
      return true;
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.type !== "keydown") return true;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return true;
      const key = event.key.toLowerCase();
      if (isMac) {
        if (key === "c" && event.metaKey && !event.shiftKey && copySelection()) return false;
        if (key === "v" && event.metaKey && !event.shiftKey) return !pasteClipboard();
        return true;
      }
      if (key === "c" && event.ctrlKey && event.shiftKey && copySelection()) return false;
      if (key === "v" && event.ctrlKey && event.shiftKey) return !pasteClipboard();
      // Ctrl+C with an active selection copies; without one it stays SIGINT.
      if (key === "c" && event.ctrlKey && !event.shiftKey && terminal.hasSelection() && copySelection()) return false;
      // Plain Ctrl+V is reserved for readline quoted-insert on Linux. Keep
      // the Windows convention while preserving Ctrl+Shift+V everywhere.
      if (isWindows && key === "v" && event.ctrlKey && !event.shiftKey) return !pasteClipboard();
      return true;
    };
    terminal.attachCustomKeyEventHandler(keyHandler);

    const enqueueOutput = (data: string) => {
      outputBuffer.push(data);
      if (!activeRef.current) {
        // Hidden tabs skip the per-frame write loop entirely; the backlog is
        // parsed in one call on activation. The timer only bounds how long
        // raw chunks may accumulate for a long-running background build.
        if (!hiddenDrainTimer) {
          hiddenDrainTimer = setTimeout(() => {
            hiddenDrainTimer = undefined;
            flushOutput();
          }, HIDDEN_FLUSH_INTERVAL_MS);
        }
        return;
      }
      if (!frame) frame = window.requestAnimationFrame(flushOutput);
    };

    activateOutputRef.current = () => {
      if (hiddenDrainTimer) {
        clearTimeout(hiddenDrainTimer);
        hiddenDrainTimer = undefined;
      }
      if (outputBuffer.length) flushOutput();
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
      if (hiddenDrainTimer) clearTimeout(hiddenDrainTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      input.dispose();
      terminal.attachCustomKeyEventHandler(() => true);
      resizeObserver.disconnect();
      unlisten?.();
      host.removeEventListener('mousedown', focusTerminal);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      activateOutputRef.current = null;
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
    // Write any PTY output that buffered while this tab was hidden before
    // the terminal is refitted and focused.
    activateOutputRef.current?.();
    window.requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // The container may still be measuring during the panel width
        // transition; the ResizeObserver path refits once it settles.
      }
      terminal.focus();
      void terminalApi.resize(chatId, sessionId, Math.max(MIN_COLS, terminal.cols), Math.max(MIN_ROWS, terminal.rows)).catch(() => undefined);
    });
  }, [active, chatId, sessionId]);

  return <div ref={hostRef} className="h-full min-h-0 w-full p-3" aria-label="Interactive terminal" />;
}

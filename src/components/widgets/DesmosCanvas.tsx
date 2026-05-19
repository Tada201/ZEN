import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useSessionStore } from '../../lib/stores/sessionStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

declare global {
  interface Window {
    Desmos: any;
  }
}

const DESMOS_SCRIPT_SRC = 'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dcba9e7c254d7e6';
const MAX_RETRIES = 3;

type ScriptLoadState = 'idle' | 'loading' | 'loaded' | 'error';

let globalLoadState: ScriptLoadState = 'idle';
let globalLoadPromise: Promise<void> | null = null;

function loadDesmosScript(): Promise<void> {
  if (window.Desmos) {
    globalLoadState = 'loaded';
    return Promise.resolve();
  }

  if (globalLoadState === 'loading' && globalLoadPromise) {
    return globalLoadPromise;
  }

  if (globalLoadState === 'loaded') {
    return Promise.resolve();
  }

  globalLoadState = 'loading';
  globalLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${DESMOS_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.Desmos) {
        globalLoadState = 'loaded';
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        globalLoadState = 'loaded';
        resolve();
      });
      existing.addEventListener('error', () => {
        globalLoadState = 'error';
        reject(new Error('Desmos API script failed to load'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = DESMOS_SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.Desmos) {
        globalLoadState = 'loaded';
        resolve();
      } else {
        globalLoadState = 'error';
        reject(new Error('Desmos API script loaded but window.Desmos is undefined'));
      }
    });
    script.addEventListener('error', () => {
      globalLoadState = 'error';
      reject(new Error('Desmos API script failed to load'));
    });
    document.head.appendChild(script);
  });

  return globalLoadPromise;
}

export interface DesmosConfig {
  invertedColors: boolean;
  graphpaper: boolean;
  showGrid: boolean;
  keypad: boolean;
  settingsMenu: boolean;
  zoomButtons: boolean;
  expressionsTopbar: boolean;
  pointsOfInterest: boolean;
  trace: boolean;
  border: boolean;
  lockViewport: boolean;
  degreeMode: boolean;
  polarMode: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  xAxisNumbers: boolean;
  yAxisNumbers: boolean;
  polarNumbers: boolean;
}

const invertColor = (hex: string) => {
  if (hex.indexOf('#') === 0) hex = hex.slice(1);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return '#000000';
  const r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16).padStart(2, '0');
  const g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16).padStart(2, '0');
  const b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

export interface DesmosCanvasRef {
  exportImage: () => void;
}

export const DesmosCanvas = forwardRef<DesmosCanvasRef, { config: DesmosConfig }>(( { config }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<any>(null);
  const { state } = useSessionStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scriptState, setScriptState] = useState<ScriptLoadState>(globalLoadState);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      if (calculatorRef.current) {
        calculatorRef.current.asyncScreenshot({
          width: 800,
          height: 600,
          targetPixelRatio: 2,
        }, (data: string) => {
          const a = document.createElement('a');
          a.href = data;
          a.download = `desmos-export-${Date.now()}.png`;
          a.click();
        });
      }
    }
  }));

  const initCalculator = useCallback(() => {
    if (!containerRef.current || calculatorRef.current) return;

    try {
      calculatorRef.current = window.Desmos.GraphingCalculator(containerRef.current, {
        keypad: config.keypad,
        expressions: false,
        settingsMenu: config.settingsMenu,
        zoomButtons: config.zoomButtons,
        expressionsTopbar: config.expressionsTopbar,
        pointsOfInterest: config.pointsOfInterest,
        trace: config.trace,
        border: config.border,
        lockViewport: config.lockViewport,
        degreeMode: config.degreeMode,
      });

      calculatorRef.current.updateSettings({
        xAxisLabel: 'X',
        yAxisLabel: 'Y',
        fontSize: 12,
        invertedColors: config.invertedColors,
        graphpaper: config.graphpaper,
        showGrid: config.showGrid,
        showXAxis: config.showXAxis,
        showYAxis: config.showYAxis,
        polarMode: config.polarMode,
        xAxisNumbers: config.xAxisNumbers,
        yAxisNumbers: config.yAxisNumbers,
        polarNumbers: config.polarNumbers,
        backgroundColor: config.invertedColors ? invertColor('#050505') : '#050505',
        textColor: config.invertedColors ? invertColor('#00FF9F') : '#00FF9F',
      });
      setLoading(false);
    } catch (err) {
      setError(`Failed to initialize Desmos: ${(err as Error).message}`);
      setLoading(false);
    }
  }, [config]);

  const handleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) return;
    retryCountRef.current += 1;
    setError(null);
    setLoading(true);
    setScriptState('idle');
    globalLoadState = 'idle';
    globalLoadPromise = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load Desmos script, then initialize calculator
  useEffect(() => {
    if (scriptState === 'loaded' && window.Desmos) {
      initCalculator();
      return;
    }

    if (scriptState === 'error' || scriptState === 'idle') {
      let cancelled = false;
      setScriptState('loading');
      setError(null);

      loadDesmosScript()
        .then(() => {
          if (!cancelled && mountedRef.current) {
            setScriptState('loaded');
          }
        })
        .catch((err) => {
          if (!cancelled && mountedRef.current) {
            setScriptState('error');
            setError(`${err.message}. Check your internet connection.`);
            setLoading(false);
          }
        });

      return () => { cancelled = true; };
    }
  }, [scriptState, initCalculator]);

  // Destroy calculator on unmount
  useEffect(() => {
    return () => {
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, []);

  // Sync Expressions & Variables
  useEffect(() => {
    if (!calculatorRef.current || !state) return;

    // 1. Sync Expressions
    const desmosExpressions = state.expressions.map(expr => ({
      id: expr.id,
      latex: expr.expr,
      color: config.invertedColors ? invertColor(expr.color || '#00FF9F') : (expr.color || '#00FF9F'),
      lineOpacity: expr.opacity || 1.0,
      lineWidth: expr.thickness || 2,
      lineStyle: expr.style === 'dashed' ? 'DASHED' : 'SOLID',
      hidden: !expr.visible
    }));

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

    // Batch update to avoid flickering
    calculatorRef.current.setExpressions([...desmosExpressions, ...desmosVariables]);
  }, [state]);

  // Sync Settings
  useEffect(() => {
    if (!calculatorRef.current) return;
    calculatorRef.current.updateSettings({
      invertedColors: config.invertedColors,
      graphpaper: config.graphpaper,
      showGrid: config.showGrid,
      keypad: config.keypad,
      settingsMenu: config.settingsMenu,
      zoomButtons: config.zoomButtons,
      expressionsTopbar: config.expressionsTopbar,
      pointsOfInterest: config.pointsOfInterest,
      trace: config.trace,
      border: config.border,
      lockViewport: config.lockViewport,
      degreeMode: config.degreeMode,
      polarMode: config.polarMode,
      showXAxis: config.showXAxis,
      showYAxis: config.showYAxis,
      xAxisNumbers: config.xAxisNumbers,
      yAxisNumbers: config.yAxisNumbers,
      polarNumbers: config.polarNumbers,
      backgroundColor: config.invertedColors ? invertColor('#050505') : '#050505',
      textColor: config.invertedColors ? invertColor('#00FF9F') : '#00FF9F',
    });
  }, [config]);

  if (error) {
    const canRetry = retryCountRef.current < MAX_RETRIES;
    return (
      <div className="relative w-full h-full bg-[#050505] flex flex-col items-center justify-center border border-[#FF0055]/30 rounded-md shadow-[0_0_30px_rgba(255,0,85,0.05)] text-[#FF0055] font-mono gap-4 text-center p-6">
        <WorkbenchIcon name="codicon:warning" size={32} />

        <div>
          <h3 className="text-lg font-bold mb-2">ENGINE FAILURE</h3>
          <p className="text-sm opacity-80">{error}</p>
          {retryCountRef.current > 0 && (
            <p className="text-xs opacity-50 mt-1">Attempt {retryCountRef.current} of {MAX_RETRIES}</p>
          )}
        </div>
        {canRetry ? (
          <WorkbenchButton
            onClick={handleRetry}
            className="mt-4 px-4 py-2 bg-[#FF0055]/10 border border-[#FF0055]/50 hover:bg-[#FF0055]/20 transition-colors uppercase text-xs tracking-widest"
          >
            [ RETRY ({MAX_RETRIES - retryCountRef.current} remaining) ]
          </WorkbenchButton>
        ) : (
          <WorkbenchButton
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-[#FF0055]/10 border border-[#FF0055]/50 hover:bg-[#FF0055]/20 transition-colors uppercase text-xs tracking-widest"
          >
            [ REBOOT SYSTEM ]
          </WorkbenchButton>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden border border-[#00FF9F]/20 rounded-md shadow-[0_0_30px_rgba(0,255,159,0.05)]">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ background: config.invertedColors ? '#050505' : '#ffffff', opacity: loading ? 0 : 1 }}
      />

      {/* HUD overlay for coordinate feedback */}
      <div className="absolute top-2 right-2 pointer-events-none z-10">
        <div className={`font-mono text-[9px] ${config.invertedColors ? 'text-[#00FF9F]/40 border-[#00FF9F]/10' : 'text-black/40 border-black/10'} bg-black/5 px-2 py-1 border backdrop-blur-sm uppercase tracking-widest`}>
          Desmos Engine Active
        </div>
      </div>

      {(loading || !state) && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[#00FF9F]/50 tracking-widest pointer-events-none bg-black/80 backdrop-blur-sm z-20">
          {scriptState === 'loading' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[#00FF9F]/30 border-t-[#00FF9F] rounded-full animate-spin" />
              <span className="text-xs">LOADING CALCULATOR ENGINE...</span>
            </div>
          ) : (
            'INITIALIZING CALCULATOR...'
          )}
        </div>
      )}
    </div>
  );
});

DesmosCanvas.displayName = 'DesmosCanvas';

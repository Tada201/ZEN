import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '@/lib/stores/sessionStore';
import { DesmosCanvas, DesmosConfig, DesmosCanvasRef } from './DesmosCanvas';
import { Expression, Issue, SessionAction } from '@/types/session';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { MathPlotExpressionItem } from './MathPlotExpressionItem';
import { MathPlotViewport } from './MathPlotViewport';
import { MathPlotVariables } from './MathPlotVariables';
import { MathPlotAnnotations } from './MathPlotAnnotations';
import { MathPlotSettings } from './MathPlotSettings';
import './math-plot.css';

// Table Parsing & Serialization Helpers
interface ParsedTable {
  numCols: number;
  colNames: string[];
  rows: string[][];
}

function parseTableExpr(exprStr: string): ParsedTable | null {
  const clean = exprStr.trim();
  if (!clean.startsWith('table ')) return null;
  const tokens = clean.split(/\s+/);
  const numCols = parseInt(tokens[1], 10);
  if (isNaN(numCols) || numCols <= 0) return null;
  const colNames = tokens.slice(2, 2 + numCols);
  const rawVals = tokens.slice(2 + numCols);
  const rows: string[][] = [];
  const numRows = Math.ceil(rawVals.length / numCols);
  for (let r = 0; r < numRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < numCols; c++) {
      row.push(rawVals[r * numCols + c] ?? '');
    }
    rows.push(row);
  }
  return { numCols, colNames, rows };
}

function serializeTableExpr(numCols: number, colNames: string[], rows: string[][]): string {
  const flatVals = rows.flat().map(v => {
    const trimmed = v.trim();
    return trimmed === '' ? '0.0' : trimmed;
  });
  return `table ${numCols} ${colNames.join(' ')} ${flatVals.join(' ')}`;
}

const handleUndo = (state: any, rollback: (v: number) => void) => {
  if (state && state.current_version > 0) {
    rollback(state.current_version - 1);
  }
};

const handleRedo = (state: any, rollback: (v: number) => void) => {
  if (state && state.current_version < state.history.length - 1) {
    rollback(state.current_version + 1);
  }
};

const handleExport = (desmosRef: React.RefObject<DesmosCanvasRef | null>) => {
  if (desmosRef.current) {
    desmosRef.current.exportImage();
  }
};

const handleClearAll = (applyAction: (a: SessionAction) => void) => {
  applyAction({ action: 'reset_session' });
};

const handleAdd = (newExpr: string, applyAction: (a: SessionAction) => void, setNewExpr: (s: string) => void) => {
  if (!newExpr.trim()) return;
  applyAction({ action: 'add_expression', expr: newExpr });
  setNewExpr('');
};

export function MathPlotInterface() {
  const { state, applyAction, activeSessionId, createSession, isLoading, rollback } = useSessionStore();
  const [newExpr, setNewExpr] = useState('y = x');
  const [localExprs, setLocalExprs] = useState<Record<string, string>>({});
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Desmos Config state
  const [desmosConfig, setDesmosConfig] = useState<DesmosConfig>({
    invertedColors: true,
    graphpaper: true,
    showGrid: true,
    keypad: false,
    settingsMenu: false,
    zoomButtons: false,
    expressionsTopbar: false,
    pointsOfInterest: true,
    trace: true,
    border: false,
    lockViewport: false,
    degreeMode: false,
    polarMode: false,
    showXAxis: true,
    showYAxis: true,
    xAxisNumbers: true,
    yAxisNumbers: true,
    polarNumbers: true
  });

  const desmosRef = useRef<DesmosCanvasRef>(null);

  // Initialize session
  useEffect(() => {
    if (!activeSessionId) {
      createSession('Math Plot Session').catch(console.error);
    }
  }, [activeSessionId, createSession]);

  // Sync local inputs to state on incoming changes
  useEffect(() => {
    if (state?.expressions) {
      const newLocal: Record<string, string> = {};
      state.expressions.forEach((expr: Expression) => {
        if (localExprs[expr.id] === undefined) {
          newLocal[expr.id] = expr.expr;
        } else {
          newLocal[expr.id] = localExprs[expr.id];
        }
      });
      
      queueMicrotask(() => {
        setLocalExprs(newLocal);
      });
    }
  }, [state?.expressions]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo(state, rollback);
        } else {
          handleUndo(state, rollback);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo(state, rollback);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, rollback]);

  const handleUpdateExpr = (id: string, val: string) => {
    setLocalExprs(prev => ({ ...prev, [id]: val }));
    // Debounced application
    setTimeout(() => {
      setLocalExprs(currentObj => {
        if (currentObj[id] === val) {
          applyAction({ action: 'update_expression', id, expr: val });
        }
        return currentObj;
      });
    }, 500);
  };

  // Preset loading sequences for canvas demos
  const handleLoadDemo = async (presetName: string) => {
    if (!presetName) return;
    setLoadingDemo(true);
    try {
      await applyAction({ action: 'reset_session' });
      
      if (presetName === 'regression') {
        await applyAction({
          action: 'add_expression',
          expr: 'table 2 x_1 y_1 1.0 2.1 2.0 3.9 3.0 6.1 4.0 8.0 5.0 9.9',
          color: '#00FF9F'
        });
        await applyAction({
          action: 'add_expression',
          expr: 'y_1 ~ m * x_1 + c',
          color: '#FF0055'
        });
        await applyAction({ action: 'set_variable', name: 'm', value: 2.0 });
        await applyAction({ action: 'set_variable', name: 'c', value: 0.0 });
        await applyAction({ action: 'set_viewport', x_min: -1, x_max: 7, y_min: -1, y_max: 12 });
      } else if (presetName === 'fourier') {
        await applyAction({
          action: 'add_expression',
          expr: 'y = sin(x) + sin(3*x)/3 + sin(5*x)/5 + sin(7*x)/7 + sin(9*x)/9',
          color: '#00FF9F'
        });
        await applyAction({ action: 'set_variable', name: 'a', value: 1.0 });
        await applyAction({ action: 'set_viewport', x_min: -10, x_max: 10, y_min: -4, y_max: 4 });
      } else if (presetName === 'parabola') {
        await applyAction({
          action: 'add_expression',
          expr: 'y = a * (x - h)^2 + k',
          color: '#00FF9F'
        });
        await applyAction({ action: 'set_variable', name: 'a', value: 1.0 });
        await applyAction({ action: 'set_variable', name: 'h', value: 0.0 });
        await applyAction({ action: 'set_variable', name: 'k', value: 0.0 });
        await applyAction({ action: 'set_viewport', x_min: -10, x_max: 10, y_min: -5, y_max: 15 });
      } else if (presetName === 'rose') {
        await applyAction({
          action: 'add_expression',
          expr: 'r = a * sin(n * theta)',
          color: '#00FF9F'
        });
        await applyAction({ action: 'set_variable', name: 'a', value: 5.0 });
        await applyAction({ action: 'set_variable', name: 'n', value: 5.0 });
        await applyAction({ action: 'set_viewport', x_min: -10, x_max: 10, y_min: -10, y_max: 10 });
      }
    } catch (e) {
      console.error('Failed to load preset demo:', e);
    } finally {
      setLoadingDemo(false);
    }
  };

  // Table spreadsheet data mutators passed to expressions
  const handleUpdateTableCell = (exprId: string, rowIndex: number, colIndex: number, cellVal: string) => {
    const currentText = localExprs[exprId] ?? state?.expressions.find((e: Expression) => e.id === exprId)?.expr ?? '';
    const parsed = parseTableExpr(currentText);
    if (!parsed) return;
    const newRows = [...parsed.rows];
    newRows[rowIndex] = [...newRows[rowIndex]];
    newRows[rowIndex][colIndex] = cellVal;
    const serialized = serializeTableExpr(parsed.numCols, parsed.colNames, newRows);
    handleUpdateExpr(exprId, serialized);
  };

  const handleUpdateColName = (exprId: string, colIndex: number, newColName: string) => {
    const currentText = localExprs[exprId] ?? state?.expressions.find((e: Expression) => e.id === exprId)?.expr ?? '';
    const parsed = parseTableExpr(currentText);
    if (!parsed) return;
    const newColNames = [...parsed.colNames];
    newColNames[colIndex] = newColName.replace(/[^a-zA-Z0-9_]/g, '');
    const serialized = serializeTableExpr(parsed.numCols, newColNames, parsed.rows);
    handleUpdateExpr(exprId, serialized);
  };

  const handleAddTableRow = (exprId: string) => {
    const currentText = localExprs[exprId] ?? state?.expressions.find((e: Expression) => e.id === exprId)?.expr ?? '';
    const parsed = parseTableExpr(currentText);
    if (!parsed) return;
    const newRow = Array(parsed.numCols).fill('0.0');
    const newRows = [...parsed.rows, newRow];
    const serialized = serializeTableExpr(parsed.numCols, parsed.colNames, newRows);
    handleUpdateExpr(exprId, serialized);
  };

  const handleDeleteTableRow = (exprId: string, rowIndex: number) => {
    const currentText = localExprs[exprId] ?? state?.expressions.find((e: Expression) => e.id === exprId)?.expr ?? '';
    const parsed = parseTableExpr(currentText);
    if (!parsed) return;
    if (parsed.rows.length <= 1) return;
    const newRows = parsed.rows.filter((_, idx) => idx !== rowIndex);
    const serialized = serializeTableExpr(parsed.numCols, parsed.colNames, newRows);
    handleUpdateExpr(exprId, serialized);
  };

  return (
    <div className="math-plot">
      {/* Sidebar: Expressions, Variables, Annotations */}
      <div className="math-plot__sidebar">
        {/* Expressions Panel */}
        <section className="flex-1 flex flex-col min-h-0">
          <h2 className="math-plot__section-title">
            <span className="math-plot__section-title-dot"></span>
            Expressions
          </h2>

          <div className="math-plot__list">
            {state?.expressions.map((expr: Expression) => (
              <MathPlotExpressionItem
                key={expr.id}
                expr={expr}
                localExprVal={localExprs[expr.id] ?? expr.expr}
                handleUpdateExpr={handleUpdateExpr}
                applyAction={applyAction}
                parseTableExpr={parseTableExpr}
                handleUpdateColName={handleUpdateColName}
                handleUpdateTableCell={handleUpdateTableCell}
                handleDeleteTableRow={handleDeleteTableRow}
                handleAddTableRow={handleAddTableRow}
              />
            ))}
          </div>

          <div className="flex gap-2 mb-1" style={{ marginTop: '6px' }}>
            <WorkbenchButton
              onClick={() => applyAction({ action: 'add_expression', expr: 'table 2 x_1 y_1 1.0 2.0 3.0 4.0' })}
              className="math-plot__btn text-[9px] py-1 flex-1 uppercase tracking-wider font-bold"
            >
              <WorkbenchIcon name="codicon:table" size={11} /> [+ ADD TABLE]
            </WorkbenchButton>
            <WorkbenchButton
              onClick={() => applyAction({ action: 'add_expression', expr: 'y_1 ~ m * x_1 + c' })}
              className="math-plot__btn text-[9px] py-1 flex-1 uppercase tracking-wider font-bold"
            >
              <WorkbenchIcon name="codicon:graph" size={11} /> [+ REGRESSION]
            </WorkbenchButton>
          </div>

          <div className="math-plot__add-row">
            <input
              type="text"
              value={newExpr}
              onChange={e => setNewExpr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd(newExpr, applyAction, setNewExpr)}
              className="math-plot__add-input"
              placeholder="e.g. y = sin(x)"
            />
            <WorkbenchButton onClick={() => handleAdd(newExpr, applyAction, setNewExpr)} className="math-plot__btn">
              <WorkbenchIcon name="codicon:add" size={14} /> ADD
            </WorkbenchButton>
          </div>
        </section>

        {/* Viewport Bounds Panel */}
        <MathPlotViewport
          viewportState={state?.viewport}
          applyAction={applyAction}
        />

        {/* Variables Panel */}
        <MathPlotVariables
          variables={state?.variables ?? {}}
          applyAction={applyAction}
        />

        {/* Annotations Section */}
        <MathPlotAnnotations
          annotations={state?.annotations}
          applyAction={applyAction}
        />
      </div>

      {/* Main Graph Area */}
      <div className="math-plot__main">
        {/* Top Toolbar */}
        <div className="math-plot__toolbar">
          <div className="math-plot__toolbar-group">
            <WorkbenchIcon name="codicon:symbol-number" size={16} />
            <span className="math-plot__toolbar-title">
              {state ? state.name : 'MATH VISUALIZATION'}
            </span>
            <div className="math-plot__divider-v"></div>
            <select
              onChange={(e) => {
                handleLoadDemo(e.target.value);
                e.target.value = ''; // Reset selection
              }}
              defaultValue=""
              disabled={loadingDemo}
              className="math-plot__preset-select"
              title="Quick-load mathematical presets"
            >
              <option value="" disabled hidden>
                {loadingDemo ? "LOADING..." : "LOAD PRESETS..."}
              </option>
              <option value="fourier">Fourier Wave</option>
              <option value="regression">Regression Line</option>
              <option value="parabola">Vertex Parabola</option>
              <option value="rose">Polar Rose</option>
            </select>
            <div className="math-plot__divider-v"></div>
            <div className="math-plot__toolbar-status">
              {isLoading && <div className="math-plot__loading"></div>}
              {activeSessionId && !isLoading && <span>SYNCED</span>}
            </div>
          </div>
          
          <div className="math-plot__toolbar-group">
            <WorkbenchButton 
              onClick={() => handleUndo(state, rollback)} 
              disabled={!state || state.current_version <= 0}
              className="math-plot__toolbar-btn"
              title="Undo (Ctrl+Z)"
            >
              <WorkbenchIcon name="codicon:discard" size={14} />
            </WorkbenchButton>
            <WorkbenchButton 
              onClick={() => handleRedo(state, rollback)} 
              disabled={!state || state.current_version >= (state.history?.length || 1) - 1}
              className="math-plot__toolbar-btn"
              title="Redo (Ctrl+Y)"
            >
              <WorkbenchIcon name="codicon:redo" size={14} />
            </WorkbenchButton>
            <div className="math-plot__divider-v"></div>
            <WorkbenchButton onClick={() => handleExport(desmosRef)} className="math-plot__toolbar-btn" title="Export PNG" disabled={!state || state.expressions.length === 0}>
              <WorkbenchIcon name="codicon:cloud-download" size={14} />
            </WorkbenchButton>
            <WorkbenchButton 
              onClick={() => handleClearAll(applyAction)} 
              className="math-plot__toolbar-btn" 
              title="Clear Session"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              <WorkbenchIcon name="codicon:clear-all" size={14} />
            </WorkbenchButton>
            <div className="math-plot__divider-v"></div>
            <WorkbenchButton 
              onClick={() => setShowSettings(!showSettings)} 
              className={`math-plot__toolbar-btn ${showSettings ? 'math-plot__toolbar-btn--active' : ''}`}
            >
              <WorkbenchIcon name="codicon:settings" size={14} />
            </WorkbenchButton>
          </div>
        </div>

        <div className="math-plot__content">
          {(!state || state.expressions.length === 0) ? (
            <div className="math-plot__empty">
              <WorkbenchIcon name="codicon:symbol-number" className="math-plot__empty-icon" />
              <div className="math-plot__empty-title">Ready for Query</div>
              <div className="math-plot__empty-hint">Enter an expression or prompt the model to generate plots.</div>
            </div>
          ) : (
            <div className="math-plot__canvas-container">
              <DesmosCanvas ref={desmosRef} config={desmosConfig} />
            </div>
          )}

          {/* Issues Overlay */}
          {state?.issues && state.issues.length > 0 && (
            <div className="math-plot__issues">
              {state.issues.map((issue: Issue, i: number) => (
                <div key={i} className="math-plot__issue">
                  <div className="math-plot__issue-header">
                    <WorkbenchIcon name="codicon:warning" size={14} />
                    <span>[{issue.severity.toUpperCase()}] {issue.message}</span>
                  </div>
                  {issue.suggestion && (
                    <div className="math-plot__issue-suggestion">
                      ↳ {issue.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Settings Dropdown */}
          {showSettings && (
            <MathPlotSettings
              desmosConfig={desmosConfig}
              setDesmosConfig={setDesmosConfig}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

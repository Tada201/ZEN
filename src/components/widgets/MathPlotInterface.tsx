import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../lib/stores/sessionStore';
import { DesmosCanvas, DesmosConfig, DesmosCanvasRef } from './DesmosCanvas';
import { Expression, Issue, Annotation, GraphSessionState, SessionAction } from '../../types/session';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import './math-plot.css';

// Hook for click outside
function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: (event: MouseEvent | TouchEvent) => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

const handleUndo = (state: GraphSessionState | null, rollback: (v: number) => void) => {
  if (state && state.current_version > 0) {
    rollback(state.current_version - 1);
  }
};

const handleRedo = (state: GraphSessionState | null, rollback: (v: number) => void) => {
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

const handleToggleVisible = (id: string, current: boolean, applyAction: (a: SessionAction) => void) => {
  applyAction({ action: 'set_visible', id, visible: !current });
};

const handleDelete = (id: string, applyAction: (a: SessionAction) => void) => {
  applyAction({ action: 'delete_expression', id });
};

const handleAddVariable = (name: string, value: string, applyAction: (a: SessionAction) => void, setName: (s: string) => void, setValue: (s: string) => void) => {
  if (!name.trim() || isNaN(parseFloat(value))) return;
  applyAction({ action: 'set_variable', name: name.trim(), value: parseFloat(value) });
  setName('');
  setValue('');
};

const handleAddAnnotation = (label: string, xStr: string, yStr: string, applyAction: (a: SessionAction) => void, setLabel: (s: string) => void, setX: (s: string) => void, setY: (s: string) => void) => {
  const x = parseFloat(xStr);
  const y = parseFloat(yStr);
  if (isNaN(x) || isNaN(y)) return;
  applyAction({ action: 'add_annotation', x, y, label });
  setX('');
  setY('');
  setLabel('');
};

export function MathPlotInterface() {
  const { state, applyAction, activeSessionId, createSession, isLoading, rollback } = useSessionStore();
  const [newExpr, setNewExpr] = useState('y = x');
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  
  // Local state for debounced inputs
  const [localExprs, setLocalExprs] = useState<Record<string, string>>({});

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
  
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const desmosRef = useRef<DesmosCanvasRef>(null);

  useOnClickOutside(settingsRef, () => setShowSettings(false));

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
      state.expressions.forEach(expr => {
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

  // Variables additions
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [varRanges, setVarRanges] = useState<Record<string, {min: number, max: number}>>({});

  const handleVarMinMax = (name: string, type: 'min' | 'max', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setVarRanges(prev => ({
        ...prev,
        [name]: {
          ...prev[name],
          [type]: num,
          min: type === 'min' ? num : (prev[name]?.min ?? -10),
          max: type === 'max' ? num : (prev[name]?.max ?? 10)
        }
      }));
    }
  };

  // Annotations
  const [newAnnLabel, setNewAnnLabel] = useState('');
  const [newAnnX, setNewAnnX] = useState('');
  const [newAnnY, setNewAnnY] = useState('');

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
              <div key={expr.id} className="math-plot__item">
                <div className="math-plot__item-header">
                  <WorkbenchButton
                    onClick={() => handleToggleVisible(expr.id, expr.visible, applyAction)}
                    className="math-plot__item-visibility"
                    style={{
                      backgroundColor: expr.visible ? (expr.color || '#00FF9F') : 'transparent',
                      color: expr.color || '#00FF9F',
                      border: `1.5px solid ${expr.color || '#00FF9F'}`
                    }}
                    title={expr.visible ? "Hide" : "Show"}
                  />
                  <div className="math-plot__item-content">
                    <div className="math-plot__item-id">{expr.id}</div>
                    <input
                      type="text"
                      value={localExprs[expr.id] ?? expr.expr}
                      onChange={(e) => handleUpdateExpr(expr.id, e.target.value)}
                      className="math-plot__input"
                      placeholder="Expression"
                    />
                    {expr.error && <div className="math-plot__error">Error: {expr.error}</div>}
                  </div>
                  <div className="math-plot__item-actions">
                    <WorkbenchButton
                      onClick={() => setEditingStyleId(editingStyleId === expr.id ? null : expr.id)}
                      className="math-plot__action-btn"
                      title="Style Options"
                    >
                      <WorkbenchIcon name="codicon:color-palette" size={14} />
                    </WorkbenchButton>
                    <WorkbenchButton
                      onClick={() => handleDelete(expr.id, applyAction)}
                      className="math-plot__action-btn math-plot__action-btn--danger"
                      title="Delete"
                    >
                      <WorkbenchIcon name="codicon:trash" size={14} />
                    </WorkbenchButton>
                  </div>
                </div>

                {editingStyleId === expr.id && (
                  <div className="math-plot__options">
                    <div className="math-plot__option-row">
                      <label className="math-plot__option-label">Color</label>
                      <input
                        type="color"
                        value={expr.color || '#00FF9F'}
                        onChange={e => applyAction({ action: 'update_expression_style', id: expr.id, color: e.target.value })}
                        className="math-plot__color-picker"
                      />
                    </div>
                    <div className="math-plot__option-row">
                      <label className="math-plot__option-label">Width</label>
                      <input
                        type="range" min="1" max="10" step="1"
                        value={expr.thickness || 3}
                        onChange={e => applyAction({ action: 'update_expression_style', id: expr.id, thickness: parseFloat(e.target.value) })}
                        className="math-plot__slider"
                      />
                      <span>{expr.thickness || 3}</span>
                    </div>
                    <div className="math-plot__option-row">
                      <label className="math-plot__option-label">Opacity</label>
                      <input
                        type="range" min="0.1" max="1.0" step="0.1"
                        value={expr.opacity || 1.0}
                        onChange={e => applyAction({ action: 'update_expression_style', id: expr.id, opacity: parseFloat(e.target.value) })}
                        className="math-plot__slider"
                      />
                      <span>{expr.opacity || 1.0}</span>
                    </div>
                    <div className="math-plot__option-row">
                      <label className="math-plot__option-label">Style</label>
                      <select
                        value={expr.style || 'solid'}
                        onChange={e => applyAction({ action: 'update_expression_style', id: expr.id, style: e.target.value })}
                        className="math-plot__select"
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
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

        {/* Variables Panel */}
        <section className="flex-none">
          <h2 className="math-plot__section-title" style={{ borderTop: '1px solid var(--fg-ghost)', paddingTop: '16px' }}>
            Variables
          </h2>
          <div className="math-plot__vars-container">
            {state && Object.entries(state.variables).map(([name, val]) => {
              const bounds = varRanges[name] || { min: -10, max: 10 };
              return (
                <div key={name} className="math-plot__var-row">
                  <span className="math-plot__var-name">{name}</span>
                  <input 
                    type="number" 
                    value={bounds.min} 
                    onChange={e => handleVarMinMax(name, 'min', e.target.value)}
                    className="math-plot__var-minmax" 
                    title="Min"
                  />
                  <input
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={(bounds.max - bounds.min) / 100}
                    value={val}
                    onChange={(e) => applyAction({ action: 'set_variable', name, value: parseFloat(e.target.value) })}
                    className="math-plot__var-range"
                  />
                  <input 
                    type="number" 
                    value={bounds.max} 
                    onChange={e => handleVarMinMax(name, 'max', e.target.value)}
                    className="math-plot__var-minmax" 
                    title="Max"
                  />
                  <span className="math-plot__var-val">{val.toFixed(1)}</span>
                </div>
              );
            })}
            
            <div className="math-plot__add-row" style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={newVarName}
                onChange={e => setNewVarName(e.target.value)}
                className="math-plot__add-input"
                placeholder="Name"
                style={{ width: '60px', flex: 'none' }}
              />
              <input
                type="number"
                value={newVarValue}
                onChange={e => setNewVarValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddVariable(newVarName, newVarValue, applyAction, setNewVarName, setNewVarValue)}
                className="math-plot__add-input"
                placeholder="Value"
              />
              <WorkbenchButton onClick={() => handleAddVariable(newVarName, newVarValue, applyAction, setNewVarName, setNewVarValue)} className="math-plot__btn">
                <WorkbenchIcon name="codicon:add" size={14} />
              </WorkbenchButton>
            </div>
          </div>
        </section>

        {/* Annotations Section */}
        <section className="flex-none pb-4">
          <h2 className="math-plot__section-title" style={{ borderTop: '1px solid var(--fg-ghost)', paddingTop: '16px' }}>
            Annotations
          </h2>
          <div className="math-plot__vars-container">
            {state?.annotations?.map((ann: Annotation) => (
              <div key={ann.id} className="math-plot__annotation-row">
                <WorkbenchButton
                  onClick={() => applyAction({ action: 'delete_annotation', id: ann.id })}
                  className="math-plot__action-btn math-plot__action-btn--danger"
                  title="Delete"
                >
                  <WorkbenchIcon name="codicon:trash" size={12} />
                </WorkbenchButton>
                <div style={{color: ann.color || '#FFF'}}>
                  ({ann.x.toFixed(1)}, {ann.y.toFixed(1)})
                </div>
                <div className="math-plot__annotation-text font-bold">
                  {ann.label}
                </div>
              </div>
            ))}
            
            <div className="math-plot__add-row" style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={newAnnLabel}
                onChange={e => setNewAnnLabel(e.target.value)}
                className="math-plot__add-input"
                placeholder="Label"
                style={{ flex: 1 }}
              />
              <input
                type="number"
                value={newAnnX}
                onChange={e => setNewAnnX(e.target.value)}
                className="math-plot__add-input"
                placeholder="X"
                style={{ width: '48px', flex: 'none' }}
              />
              <input
                type="number"
                value={newAnnY}
                onChange={e => setNewAnnY(e.target.value)}
                className="math-plot__add-input"
                placeholder="Y"
                style={{ width: '48px', flex: 'none' }}
              />
              <WorkbenchButton onClick={() => handleAddAnnotation(newAnnLabel, newAnnX, newAnnY, applyAction, setNewAnnLabel, setNewAnnX, setNewAnnY)} className="math-plot__btn">
                <WorkbenchIcon name="codicon:add" size={14} />
              </WorkbenchButton>
            </div>
          </div>
        </section>
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
              style={{ color: '#ff5555' }}
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
            <div ref={settingsRef} className="math-plot__settings-panel">
              <div className="math-plot__settings-title">Graph Properties</div>

              <div className="math-plot__settings-list custom-scrollbar">
                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Dark Mode</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, invertedColors: !prev.invertedColors }))}
                    className={`math-plot__settings-toggle ${desmosConfig.invertedColors ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.invertedColors ? <WorkbenchIcon name="codicon:moon" size={14} /> : <WorkbenchIcon name="codicon:sun" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Show Grid</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                    className={`math-plot__settings-toggle ${desmosConfig.showGrid ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    <WorkbenchIcon name="codicon:table" size={14} />
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Graph Paper</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, graphpaper: !prev.graphpaper }))}
                    className={`math-plot__settings-toggle ${desmosConfig.graphpaper ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.graphpaper ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item" style={{ marginTop: '8px', borderTop: '1px solid var(--fg-ghost)', paddingTop: '8px' }}>
                  <span className="math-plot__settings-label">Points of Interest</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, pointsOfInterest: !prev.pointsOfInterest }))}
                    className={`math-plot__settings-toggle ${desmosConfig.pointsOfInterest ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.pointsOfInterest ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Trace</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, trace: !prev.trace }))}
                    className={`math-plot__settings-toggle ${desmosConfig.trace ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.trace ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item" style={{ marginTop: '8px', borderTop: '1px solid var(--fg-ghost)', paddingTop: '8px' }}>
                  <span className="math-plot__settings-label">Degree Mode</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, degreeMode: !prev.degreeMode }))}
                    className={`math-plot__settings-toggle ${desmosConfig.degreeMode ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.degreeMode ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Polar Mode</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, polarMode: !prev.polarMode }))}
                    className={`math-plot__settings-toggle ${desmosConfig.polarMode ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.polarMode ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-label" style={{ marginTop: '12px', opacity: 0.6 }}>Interface</div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Keypad</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, keypad: !prev.keypad }))}
                    className={`math-plot__settings-toggle ${desmosConfig.keypad ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.keypad ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Settings Menu</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, settingsMenu: !prev.settingsMenu }))}
                    className={`math-plot__settings-toggle ${desmosConfig.settingsMenu ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.settingsMenu ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Zoom Buttons</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, zoomButtons: !prev.zoomButtons }))}
                    className={`math-plot__settings-toggle ${desmosConfig.zoomButtons ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.zoomButtons ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>
                
                <div className="math-plot__settings-label" style={{ marginTop: '12px', opacity: 0.6 }}>Axes</div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Show X Axis</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, showXAxis: !prev.showXAxis }))}
                    className={`math-plot__settings-toggle ${desmosConfig.showXAxis ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.showXAxis ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>

                <div className="math-plot__settings-item">
                  <span className="math-plot__settings-label">Show Y Axis</span>
                  <WorkbenchButton
                    onClick={() => setDesmosConfig(prev => ({ ...prev, showYAxis: !prev.showYAxis }))}
                    className={`math-plot__settings-toggle ${desmosConfig.showYAxis ? 'math-plot__settings-toggle--active' : ''}`}
                  >
                    {desmosConfig.showYAxis ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
                  </WorkbenchButton>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

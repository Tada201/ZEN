import { useState, useEffect, useRef } from 'react';
import { SessionAction } from '@/types/session';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface MathPlotVariablesProps {
  variables: Record<string, number>;
  applyAction: (action: SessionAction) => void;
}

export function MathPlotVariables({ variables, applyAction }: MathPlotVariablesProps) {
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [varRanges, setVarRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [animatingVars, setAnimatingVars] = useState<Record<string, boolean>>({});

  const variablesRef = useRef(variables);
  const varRangesRef = useRef(varRanges);

  useEffect(() => {
    variablesRef.current = variables;
  }, [variables]);

  useEffect(() => {
    varRangesRef.current = varRanges;
  }, [varRanges]);

  // Throttled dynamic Variable Animation interval loop (isolated here)
  useEffect(() => {
    const activeVars = Object.entries(animatingVars).filter(([_, isPlaying]) => isPlaying);
    if (activeVars.length === 0) return;

    const interval = setInterval(() => {
      const currentVars = variablesRef.current;
      activeVars.forEach(([name]) => {
        const currentVal = currentVars[name] ?? 0.0;
        const bounds = varRangesRef.current[name] || { min: -10, max: 10 };
        const step = (bounds.max - bounds.min) / 100 || 0.1;
        let nextVal = currentVal + step;
        if (nextVal > bounds.max) {
          nextVal = bounds.min;
        }
        applyAction({ action: 'set_variable', name, value: parseFloat(nextVal.toFixed(3)) });
      });
    }, 100);

    return () => clearInterval(interval);
  }, [animatingVars, applyAction]);

  const handleVarMinMax = (name: string, type: 'min' | 'max', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setVarRanges((prev) => {
        const existing = prev[name] || { min: -10, max: 10 };
        return {
          ...prev,
          [name]: {
            ...existing,
            [type]: num,
          },
        };
      });
    }
  };

  const handleAddVariable = () => {
    if (!newVarName.trim() || isNaN(parseFloat(newVarValue))) return;
    applyAction({ action: 'set_variable', name: newVarName.trim(), value: parseFloat(newVarValue) });
    setNewVarName('');
    setNewVarValue('');
  };

  return (
    <section className="flex-none">
      <h2 className="math-plot__section-title">Variables</h2>
      <div className="math-plot__vars-container">
        {Object.entries(variables).map(([name, val]) => {
          const bounds = varRanges[name] || { min: -10, max: 10 };
          return (
            <div key={name} className="math-plot__var-row">
              <button
                onClick={() => setAnimatingVars((prev) => ({ ...prev, [name]: !prev[name] }))}
                className={`math-plot__var-play-btn ${animatingVars[name] ? 'math-plot__var-play-btn--active' : ''}`}
                title={animatingVars[name] ? "Pause Animation" : "Play Animation"}
              >
                <WorkbenchIcon name={animatingVars[name] ? "codicon:debug-pause" : "codicon:debug-start"} size={10} />
              </button>
              <span className="math-plot__var-name">{name}</span>
              <input
                type="number"
                value={bounds.min}
                onChange={(e) => handleVarMinMax(name, 'min', e.target.value)}
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
                onChange={(e) => handleVarMinMax(name, 'max', e.target.value)}
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
            onChange={(e) => setNewVarName(e.target.value)}
            className="math-plot__add-input"
            placeholder="Name"
            style={{ width: '60px', flex: 'none' }}
          />
          <input
            type="number"
            value={newVarValue}
            onChange={(e) => setNewVarValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVariable()}
            className="math-plot__add-input"
            placeholder="Value"
          />
          <WorkbenchButton onClick={handleAddVariable} className="math-plot__btn">
            <WorkbenchIcon name="codicon:add" size={14} />
          </WorkbenchButton>
        </div>
      </div>
    </section>
  );
}

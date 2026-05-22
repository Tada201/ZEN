import { useEffect, useRef } from 'react';
import { DesmosConfig } from './DesmosCanvas';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface MathPlotSettingsProps {
  desmosConfig: DesmosConfig;
  setDesmosConfig: React.Dispatch<React.SetStateAction<DesmosConfig>>;
  onClose: () => void;
}

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

export function MathPlotSettings({ desmosConfig, setDesmosConfig, onClose }: MathPlotSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(panelRef, onClose);

  return (
    <div ref={panelRef} className="math-plot__settings-panel">
      <div className="math-plot__settings-title">Graph Properties</div>

      <div className="math-plot__settings-list custom-scrollbar">
        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Dark Mode</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, invertedColors: !prev.invertedColors }))}
            className={`math-plot__settings-toggle ${desmosConfig.invertedColors ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.invertedColors ? <WorkbenchIcon name="codicon:moon" size={14} /> : <WorkbenchIcon name="codicon:sun" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Show Grid</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, showGrid: !prev.showGrid }))}
            className={`math-plot__settings-toggle ${desmosConfig.showGrid ? 'math-plot__settings-toggle--active' : ''}`}
          >
            <WorkbenchIcon name="codicon:table" size={14} />
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Graph Paper</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, graphpaper: !prev.graphpaper }))}
            className={`math-plot__settings-toggle ${desmosConfig.graphpaper ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.graphpaper ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item" style={{ marginTop: '8px', borderTop: '1px solid var(--fg-ghost)', paddingTop: '8px' }}>
          <span className="math-plot__settings-label">Points of Interest</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, pointsOfInterest: !prev.pointsOfInterest }))}
            className={`math-plot__settings-toggle ${desmosConfig.pointsOfInterest ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.pointsOfInterest ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Trace</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, trace: !prev.trace }))}
            className={`math-plot__settings-toggle ${desmosConfig.trace ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.trace ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item" style={{ marginTop: '8px', borderTop: '1px solid var(--fg-ghost)', paddingTop: '8px' }}>
          <span className="math-plot__settings-label">Degree Mode</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, degreeMode: !prev.degreeMode }))}
            className={`math-plot__settings-toggle ${desmosConfig.degreeMode ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.degreeMode ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Polar Mode</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, polarMode: !prev.polarMode }))}
            className={`math-plot__settings-toggle ${desmosConfig.polarMode ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.polarMode ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-label" style={{ marginTop: '12px', opacity: 0.6 }}>Interface</div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Keypad</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, keypad: !prev.keypad }))}
            className={`math-plot__settings-toggle ${desmosConfig.keypad ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.keypad ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Settings Menu</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, settingsMenu: !prev.settingsMenu }))}
            className={`math-plot__settings-toggle ${desmosConfig.settingsMenu ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.settingsMenu ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Zoom Buttons</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, zoomButtons: !prev.zoomButtons }))}
            className={`math-plot__settings-toggle ${desmosConfig.zoomButtons ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.zoomButtons ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-label" style={{ marginTop: '12px', opacity: 0.6 }}>Axes</div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Show X Axis</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, showXAxis: !prev.showXAxis }))}
            className={`math-plot__settings-toggle ${desmosConfig.showXAxis ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.showXAxis ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>

        <div className="math-plot__settings-item">
          <span className="math-plot__settings-label">Show Y Axis</span>
          <WorkbenchButton
            onClick={() => setDesmosConfig((prev) => ({ ...prev, showYAxis: !prev.showYAxis }))}
            className={`math-plot__settings-toggle ${desmosConfig.showYAxis ? 'math-plot__settings-toggle--active' : ''}`}
          >
            {desmosConfig.showYAxis ? <WorkbenchIcon name="codicon:check" size={14} /> : <WorkbenchIcon name="codicon:close" size={14} />}
          </WorkbenchButton>
        </div>
      </div>
    </div>
  );
}

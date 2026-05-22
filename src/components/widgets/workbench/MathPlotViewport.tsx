import { useState, useEffect } from 'react';
import { GraphSessionState, SessionAction } from '@/types/session';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface MathPlotViewportProps {
  viewportState: GraphSessionState['viewport'] | undefined;
  applyAction: (action: SessionAction) => void;
}

export function MathPlotViewport({ viewportState, applyAction }: MathPlotViewportProps) {
  const [isViewportCollapsed, setIsViewportCollapsed] = useState(true);
  const [vpMinX, setVpMinX] = useState('-10');
  const [vpMaxX, setVpMaxX] = useState('10');
  const [vpMinY, setVpMinY] = useState('-10');
  const [vpMaxY, setVpMaxY] = useState('10');

  // Sync inputs when state viewport updates from parent / engine panning
  useEffect(() => {
    if (viewportState) {
      setVpMinX(viewportState.x_min.toString());
      setVpMaxX(viewportState.x_max.toString());
      setVpMinY(viewportState.y_min.toString());
      setVpMaxY(viewportState.y_max.toString());
    }
  }, [viewportState]);

  const handleSyncViewport = () => {
    const xMin = parseFloat(vpMinX);
    const xMax = parseFloat(vpMaxX);
    const yMin = parseFloat(vpMinY);
    const yMax = parseFloat(vpMaxY);
    if (!isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax)) {
      applyAction({
        action: 'set_viewport',
        x_min: xMin,
        x_max: xMax,
        y_min: yMin,
        y_max: yMax,
      });
    }
  };

  return (
    <div className="math-plot__folder">
      <div
        className="math-plot__folder-header"
        onClick={() => setIsViewportCollapsed(!isViewportCollapsed)}
      >
        <div className="math-plot__folder-title">
          <WorkbenchIcon name={isViewportCollapsed ? "codicon:chevron-right" : "codicon:chevron-down"} size={12} />
          <span>Viewport Limits</span>
        </div>
        <WorkbenchButton
          onClick={(e) => {
            e.stopPropagation();
            handleSyncViewport();
          }}
          className="math-plot__btn text-[8px] py-0.5 px-2"
          title="Sync Viewport coordinates to Desmos Engine"
        >
          SYNC
        </WorkbenchButton>
      </div>
      {!isViewportCollapsed && (
        <div className="math-plot__folder-content">
          <div className="math-plot__viewport-grid">
            <div className="math-plot__viewport-field">
              <span className="math-plot__viewport-label">X Min</span>
              <input
                type="number"
                value={vpMinX}
                onChange={(e) => setVpMinX(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSyncViewport()}
                onBlur={handleSyncViewport}
                className="math-plot__viewport-input"
              />
            </div>
            <div className="math-plot__viewport-field">
              <span className="math-plot__viewport-label">X Max</span>
              <input
                type="number"
                value={vpMaxX}
                onChange={(e) => setVpMaxX(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSyncViewport()}
                onBlur={handleSyncViewport}
                className="math-plot__viewport-input"
              />
            </div>
            <div className="math-plot__viewport-field">
              <span className="math-plot__viewport-label">Y Min</span>
              <input
                type="number"
                value={vpMinY}
                onChange={(e) => setVpMinY(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSyncViewport()}
                onBlur={handleSyncViewport}
                className="math-plot__viewport-input"
              />
            </div>
            <div className="math-plot__viewport-field">
              <span className="math-plot__viewport-label">Y Max</span>
              <input
                type="number"
                value={vpMaxY}
                onChange={(e) => setVpMaxY(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSyncViewport()}
                onBlur={handleSyncViewport}
                className="math-plot__viewport-input"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

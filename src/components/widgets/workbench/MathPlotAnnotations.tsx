import { useState } from 'react';
import { Annotation, SessionAction } from '@/types/session';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface MathPlotAnnotationsProps {
  annotations: Annotation[] | undefined;
  applyAction: (action: SessionAction) => void;
}

export function MathPlotAnnotations({ annotations, applyAction }: MathPlotAnnotationsProps) {
  const [newAnnLabel, setNewAnnLabel] = useState('');
  const [newAnnX, setNewAnnX] = useState('');
  const [newAnnY, setNewAnnY] = useState('');

  const handleAddAnnotation = () => {
    const x = parseFloat(newAnnX);
    const y = parseFloat(newAnnY);
    if (isNaN(x) || isNaN(y)) return;
    applyAction({ action: 'add_annotation', x, y, label: newAnnLabel });
    setNewAnnLabel('');
    setNewAnnX('');
    setNewAnnY('');
  };

  return (
    <section className="flex-none pb-4">
      <h2 className="math-plot__section-title">Annotations</h2>
      <div className="math-plot__vars-container">
        {annotations?.map((ann: Annotation) => (
          <div key={ann.id} className="math-plot__annotation-row">
            <WorkbenchButton
              onClick={() => applyAction({ action: 'delete_annotation', id: ann.id })}
              className="math-plot__action-btn math-plot__action-btn--danger"
              title="Delete"
            >
              <WorkbenchIcon name="codicon:trash" size={12} />
            </WorkbenchButton>
            <div style={{ color: ann.color || 'hsl(var(--foreground))' }}>
              ({ann.x.toFixed(1)}, {ann.y.toFixed(1)})
            </div>
            <div className="math-plot__annotation-text font-bold">{ann.label}</div>
          </div>
        ))}

        <div className="math-plot__add-row" style={{ marginTop: '8px' }}>
          <input
            type="text"
            value={newAnnLabel}
            onChange={(e) => setNewAnnLabel(e.target.value)}
            className="math-plot__add-input"
            placeholder="Label"
            style={{ flex: 1 }}
          />
          <input
            type="number"
            value={newAnnX}
            onChange={(e) => setNewAnnX(e.target.value)}
            className="math-plot__add-input"
            placeholder="X"
            style={{ width: '48px', flex: 'none' }}
          />
          <input
            type="number"
            value={newAnnY}
            onChange={(e) => setNewAnnY(e.target.value)}
            className="math-plot__add-input"
            placeholder="Y"
            style={{ width: '48px', flex: 'none' }}
          />
          <WorkbenchButton onClick={handleAddAnnotation} className="math-plot__btn">
            <WorkbenchIcon name="codicon:add" size={14} />
          </WorkbenchButton>
        </div>
      </div>
    </section>
  );
}

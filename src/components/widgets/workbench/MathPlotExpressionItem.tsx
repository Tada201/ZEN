import { useState } from 'react';
import { Expression, SessionAction } from '@/types/session';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { MathPlotSpreadsheet } from './MathPlotSpreadsheet';

interface ParsedTable {
  numCols: number;
  colNames: string[];
  rows: string[][];
}

const getAccentColor = () => {
  if (typeof window === 'undefined') return '262 83% 65%';
  return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '262 83% 65%';
};
const DEFAULT_COLOR = `hsl(${getAccentColor()})`;

interface MathPlotExpressionItemProps {
  expr: Expression;
  localExprVal: string;
  handleUpdateExpr: (id: string, val: string) => void;
  applyAction: (action: SessionAction) => void;
  parseTableExpr: (exprStr: string) => ParsedTable | null;
  handleUpdateColName: (exprId: string, colIndex: number, newColName: string) => void;
  handleUpdateTableCell: (exprId: string, rowIndex: number, colIndex: number, cellVal: string) => void;
  handleDeleteTableRow: (exprId: string, rowIndex: number) => void;
  handleAddTableRow: (exprId: string) => void;
}

export function MathPlotExpressionItem({
  expr,
  localExprVal,
  handleUpdateExpr,
  applyAction,
  parseTableExpr,
  handleUpdateColName,
  handleUpdateTableCell,
  handleDeleteTableRow,
  handleAddTableRow,
}: MathPlotExpressionItemProps) {
  const [isStyleExpanded, setIsStyleExpanded] = useState(false);

  const parsed = parseTableExpr(localExprVal);

  const handleToggleVisible = () => {
    applyAction({ action: 'set_visible', id: expr.id, visible: !expr.visible });
  };

  const handleDelete = () => {
    applyAction({ action: 'delete_expression', id: expr.id });
  };

  return (
    <div className="math-plot__item">
      <div className="math-plot__item-header">
        <WorkbenchButton
          onClick={handleToggleVisible}
          className="math-plot__item-visibility"
          style={{
            backgroundColor: expr.visible ? (expr.color || DEFAULT_COLOR) : 'transparent',
            color: expr.color || DEFAULT_COLOR,
            border: `1.5px solid ${expr.color || DEFAULT_COLOR}`,
          }}
          title={expr.visible ? "Hide" : "Show"}
        />
        <div className="math-plot__item-content">
          <div className="math-plot__item-id">{expr.id}</div>
          {parsed ? (
            <MathPlotSpreadsheet
              expr={expr}
              parsed={parsed}
              handleUpdateColName={handleUpdateColName}
              handleUpdateTableCell={handleUpdateTableCell}
              handleDeleteTableRow={handleDeleteTableRow}
              handleAddTableRow={handleAddTableRow}
            />
          ) : (
            <input
              type="text"
              value={localExprVal}
              onChange={(e) => handleUpdateExpr(expr.id, e.target.value)}
              className="math-plot__input"
              placeholder="Expression"
            />
          )}
          {expr.error && <div className="math-plot__error">Error: {expr.error}</div>}
        </div>
        <div className="math-plot__item-actions">
          <WorkbenchButton
            onClick={() => setIsStyleExpanded(!isStyleExpanded)}
            className={`math-plot__action-btn ${isStyleExpanded ? 'math-plot__action-btn--active' : ''}`}
            title="Style Options"
          >
            <WorkbenchIcon name="codicon:color-palette" size={14} />
          </WorkbenchButton>
          <WorkbenchButton
            onClick={handleDelete}
            className="math-plot__action-btn math-plot__action-btn--danger"
            title="Delete"
          >
            <WorkbenchIcon name="codicon:trash" size={14} />
          </WorkbenchButton>
        </div>
      </div>

      {isStyleExpanded && (
        <div className="math-plot__options">
          <div className="math-plot__option-row">
            <label className="math-plot__option-label">Color</label>
            <input
              type="color"
              value={expr.color || DEFAULT_COLOR}
              onChange={(e) =>
                applyAction({ action: 'update_expression_style', id: expr.id, color: e.target.value })
              }
              className="math-plot__color-picker"
            />
          </div>
          <div className="math-plot__option-row">
            <label className="math-plot__option-label">Width</label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={expr.thickness || 3}
              onChange={(e) =>
                applyAction({
                  action: 'update_expression_style',
                  id: expr.id,
                  thickness: parseFloat(e.target.value),
                })
              }
              className="math-plot__slider"
            />
            <span>{expr.thickness || 3}</span>
          </div>
          <div className="math-plot__option-row">
            <label className="math-plot__option-label">Opacity</label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={expr.opacity || 1.0}
              onChange={(e) =>
                applyAction({
                  action: 'update_expression_style',
                  id: expr.id,
                  opacity: parseFloat(e.target.value),
                })
              }
              className="math-plot__slider"
            />
            <span>{expr.opacity || 1.0}</span>
          </div>
          <div className="math-plot__option-row">
            <label className="math-plot__option-label">Style</label>
            <select
              value={expr.style || 'solid'}
              onChange={(e) =>
                applyAction({ action: 'update_expression_style', id: expr.id, style: e.target.value })
              }
              className="math-plot__select"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

import { Expression } from '@/types/session';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface MathPlotSpreadsheetProps {
  expr: Expression;
  parsed: {
    numCols: number;
    colNames: string[];
    rows: string[][];
  };
  handleUpdateColName: (exprId: string, colIndex: number, newColName: string) => void;
  handleUpdateTableCell: (exprId: string, rowIndex: number, colIndex: number, cellVal: string) => void;
  handleDeleteTableRow: (exprId: string, rowIndex: number) => void;
  handleAddTableRow: (exprId: string) => void;
}

export function MathPlotSpreadsheet({
  expr,
  parsed,
  handleUpdateColName,
  handleUpdateTableCell,
  handleDeleteTableRow,
  handleAddTableRow,
}: MathPlotSpreadsheetProps) {
  return (
    <div className="math-plot__spreadsheet">
      <div className="math-plot__spreadsheet-header">
        {parsed.colNames.map((colName, cIdx) => (
          <div key={cIdx} className="math-plot__spreadsheet-col">
            <input
              type="text"
              value={colName}
              onChange={(e) => handleUpdateColName(expr.id, cIdx, e.target.value)}
              className="math-plot__spreadsheet-col-input"
            />
          </div>
        ))}
      </div>
      <div className="math-plot__spreadsheet-body custom-scrollbar">
        {parsed.rows.map((row, rIdx) => (
          <div key={rIdx} className="math-plot__spreadsheet-row">
            {row.map((cellVal, cIdx) => (
              <div key={cIdx} className="math-plot__spreadsheet-cell">
                <input
                  type="text"
                  value={cellVal}
                  onChange={(e) => handleUpdateTableCell(expr.id, rIdx, cIdx, e.target.value)}
                  className="math-plot__spreadsheet-cell-input"
                />
              </div>
            ))}
            <button
              onClick={() => handleDeleteTableRow(expr.id, rIdx)}
              disabled={parsed.rows.length <= 1}
              className="math-plot__spreadsheet-row-del"
              title="Delete Row"
            >
              <WorkbenchIcon name="codicon:close" size={10} />
            </button>
          </div>
        ))}
      </div>
      <div className="math-plot__spreadsheet-actions">
        <span className="text-[8px] opacity-40 uppercase tracking-widest pl-1">
          {parsed.rows.length} rows x {parsed.numCols} cols
        </span>
        <WorkbenchButton
          onClick={() => handleAddTableRow(expr.id)}
          className="math-plot__btn text-[9px] py-0.5 px-2"
        >
          <WorkbenchIcon name="codicon:add" size={10} /> ROW
        </WorkbenchButton>
      </div>
    </div>
  );
}

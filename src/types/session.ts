export interface Coordinate {
  x: number;
  y: number;
}

export interface BoundingBox {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export type PlotType = 'Function' | 'Parametric' | 'Polar';

export interface PlotRequest {
  plot_type: PlotType;
  x_expr: string;
  y_expr?: string;
  domain: [number, number];
  step: number;
  max_points: number;
  variables: Record<string, number>;
}

export interface PlotOutput {
  plot_type: PlotType;
  points: [number, number][];
  bounds: [number, number, number, number]; // x_min, x_max, y_min, y_max
  point_count: number;
  is_closed: boolean;
}

export interface Expression {
  id: string;
  expr: string;
  visible: boolean;
  color: string;
  dependencies: string[];
  error?: string;
  thickness?: number;
  opacity?: number;
  style?: string;
}

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  suggestion?: string;
  affected_expression?: string;
}

export interface Commit {
  version: number;
  timestamp: string;
  author: string;
  summary: string;
}

export interface GraphSessionState {
  id: string;
  name: string;
  expressions: Expression[];
  variables: Record<string, number>;
  annotations: Annotation[];
  history: Commit[];
  current_version: number;
  issues: Issue[];
  viewport: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
}

export interface Annotation {
  id: string;
  expr_id?: string;
  x: number;
  y: number;
  label?: string;
  color: string;
  style: string;  // "point", "label", "marker", "arrow"
  visible: boolean;
}

export interface ExprPlotResult {
  id: string;
  color: string;
  points: [number, number][];
  bounds: [number, number, number, number];
  error?: string;
  thickness: number;
  opacity: number;
  line_style: string;
  inequality_op?: string;
}

export interface SessionFeedback {
  session_id: string;
  version: number;
  state_snapshot: GraphSessionState;
  issues: Issue[];
  plots: ExprPlotResult[];
  status: 'success' | 'error';
  summary: string;
}

export type SessionAction =
  | { action: 'add_expression'; expr: string; color?: string; plot_type?: string; y_expr?: string; domain?: [number, number]; step?: number; label?: string; renderer?: string }
  | { action: 'update_expression'; id: string; expr: string }
  | { action: 'update_expression_style'; id: string; color?: string; thickness?: number; opacity?: number; style?: string }
  | { action: 'delete_expression'; id: string }
  | { action: 'set_visible'; id: string; visible: boolean }
  | { action: 'set_variable'; name: string; value: number }
  | { action: 'delete_variable'; name: string }
  | { action: 'set_viewport'; x_min: number; x_max: number; y_min: number; y_max: number }
  | { action: 'add_annotation'; x: number; y: number; label?: string; color?: string; style?: string; expr_id?: string }
  | { action: 'delete_annotation'; id: string }
  | { action: 'set_annotation_visible'; id: string; visible: boolean }
  | { action: 'get_state' }
  | { action: 'list_expressions' }
  | { action: 'reset_session' }
  | { action: 'capture_vision' };

/// Vision capture response for LLM analysis
export interface VisionCapture {
  session_id: string;
  viewport: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  expressions: VisionExpression[];
  variables: Record<string, number>;
  plots: VisionPlot[];
  issues: VisionIssue[];
}

export interface VisionExpression {
  id: string;
  expr: string;
  color: string;
  visible: boolean;
  error?: string;
}

export interface VisionPlot {
  id: string;
  color: string;
  point_count: number;
  bounds: [number, number, number, number];
  error?: string;
}

export interface VisionIssue {
  severity: string;
  code: string;
  message: string;
  suggestion: string;
}

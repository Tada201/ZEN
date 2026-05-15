/// Canvas-related utilities for LLM context awareness
pub mod planning;
pub mod validator;
pub mod geometry;
pub mod anchors;
pub mod plot;
pub mod session;
pub mod protocol;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use planning::*;
pub use validator::*;
pub use geometry::*;
pub use anchors::*;
pub use plot::*;
pub use session::{GraphSession, SessionAction, Viewport, Expression, Issue, ExprPlotResult, VisionCapture, VisionExpression, VisionPlot, VisionIssue};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasObject {
    pub id: String,
    pub kind: String,
    pub bbox: [f64; 4], // [x1, y1, x2, y2]
    pub source: String, // 'llm' | 'user'
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasSummary {
    pub canvas: [u32; 2], // [width, height]
    pub object_count: usize,
    pub objects: Vec<CanvasObject>,
    pub background_color: String,
}

/// Compute bounding box for an operation type
pub fn compute_bbox(kind: &str, params: &Value) -> Option<[f64; 4]> {
    match kind {
        "line" => {
            let x1 = params.get("x1")?.as_f64()?;
            let y1 = params.get("y1")?.as_f64()?;
            let x2 = params.get("x2")?.as_f64()?;
            let y2 = params.get("y2")?.as_f64()?;
            Some([x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2)])
        }
        "rect" => {
            let x = params.get("x")?.as_f64()?;
            let y = params.get("y")?.as_f64()?;
            let w = params.get("w")?.as_f64()?;
            let h = params.get("h")?.as_f64()?;
            Some([x, y, x + w, y + h])
        }
        "circle" => {
            let x = params.get("x")?.as_f64()?;
            let y = params.get("y")?.as_f64()?;
            let r = params.get("r")?.as_f64()?;
            Some([x - r, y - r, x + r, y + r])
        }
        "ellipse" => {
            let x = params.get("x")?.as_f64()?;
            let y = params.get("y")?.as_f64()?;
            let rx = params.get("rx")?.as_f64()?;
            let ry = params.get("ry")?.as_f64()?;
            Some([x - rx, y - ry, x + rx, y + ry])
        }
        "polygon" | "path" => {
            let points = params.get("points")?.as_array()?;
            if points.is_empty() {
                return None;
            }
            let mut min_x = f64::INFINITY;
            let mut min_y = f64::INFINITY;
            let mut max_x = f64::NEG_INFINITY;
            let mut max_y = f64::NEG_INFINITY;

            for pt in points {
                if let (Some(x), Some(y)) = (pt.get("x").and_then(|v| v.as_f64()), pt.get("y").and_then(|v| v.as_f64())) {
                    min_x = min_x.min(x);
                    min_y = min_y.min(y);
                    max_x = max_x.max(x);
                    max_y = max_y.max(y);
                }
            }
            if min_x.is_finite() && min_y.is_finite() {
                Some([min_x, min_y, max_x, max_y])
            } else {
                None
            }
        }
        "text" => {
            let x = params.get("x")?.as_f64()?;
            let y = params.get("y")?.as_f64()?;
            let size = params.get("size")?.as_f64()?;
            let text = params.get("text")?.as_str()?;
            let text_width = text.len() as f64 * (size * 0.6);
            Some([x, y - size, x + text_width, y + size])
        }
        "arrow" => {
            let x1 = params.get("x1")?.as_f64()?;
            let y1 = params.get("y1")?.as_f64()?;
            let x2 = params.get("x2")?.as_f64()?;
            let y2 = params.get("y2")?.as_f64()?;
            Some([x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2)])
        }
        "eraser" => {
            let points = params.get("points")?.as_array()?;
            let radius = params.get("radius")?.as_f64()?;
            if points.is_empty() {
                return None;
            }
            let mut min_x = f64::INFINITY;
            let mut min_y = f64::INFINITY;
            let mut max_x = f64::NEG_INFINITY;
            let mut max_y = f64::NEG_INFINITY;

            for pt in points {
                if let (Some(x), Some(y)) = (pt.get("x").and_then(|v| v.as_f64()), pt.get("y").and_then(|v| v.as_f64())) {
                    min_x = min_x.min(x - radius);
                    min_y = min_y.min(y - radius);
                    max_x = max_x.max(x + radius);
                    max_y = max_y.max(y + radius);
                }
            }
            if min_x.is_finite() && min_y.is_finite() {
                Some([min_x, min_y, max_x, max_y])
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Generate canvas summary from ops for LLM context
pub fn generate_canvas_summary(
    width: u32,
    height: u32,
    ops: &[Value],
    background: &str,
    source_filter: Option<&str>,
) -> CanvasSummary {
    let mut objects = Vec::new();
    let mut seen_kinds = std::collections::HashSet::new();

    for op in ops {
        if let Some(kind) = op.get("kind").and_then(|v| v.as_str()) {
            // Skip bg/clear ops
            if kind == "bg" || kind == "clear" {
                continue;
            }

            // Filter by source if specified
            if let Some(filter) = source_filter {
                if let Some(source) = op.get("source").and_then(|v| v.as_str()) {
                    if source != filter {
                        continue;
                    }
                }
            }

            if let Some(bbox) = compute_bbox(kind, op) {
                let id = format!(
                    "{}_{:x}",
                    kind,
                    objects.len() as u64 + seen_kinds.len() as u64
                );
                seen_kinds.insert(kind);
                objects.push(CanvasObject {
                    id,
                    kind: kind.to_string(),
                    bbox,
                    source: op
                        .get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                });
            }
        }
    }

    CanvasSummary {
        canvas: [width, height],
        object_count: objects.len(),
        objects,
        background_color: background.to_string(),
    }
}

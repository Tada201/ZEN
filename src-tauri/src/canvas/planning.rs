/// Canvas Planning Phase
/// Allows LLM to generate a semantic plan before drawing
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementHint {
    /// Semantic placement: "center", "top-center", "bottom-left", etc.
    pub semantic: String,
    /// or relative to another object: "right_of:object1", "below:object1"
    pub relative: Option<String>,
    /// explicit offset if needed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<[i32; 2]>, // [dx, dy]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedObject {
    /// Unique ID for reference in later commands
    pub id: String,
    /// Type of object: "text", "circle", "rect", "diagram", etc.
    pub kind: String,
    /// Human-readable description
    pub description: String,
    /// Where to place it
    pub placement: PlacementHint,
    /// Layer (z-index): 0=background, 1=middle, 2=foreground
    #[serde(default)]
    pub layer: u32,
    /// Size hint: "small", "medium", "large"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    /// Style hint: "bold", "italic", "colored", etc.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingPlan {
    /// Title/description of what will be drawn
    pub title: String,
    /// List of objects to draw in order
    pub objects: Vec<PlannedObject>,
    /// Canvas dimensions
    pub canvas: [u32; 2],
    /// Total expected steps
    pub estimated_steps: usize,
}

/// Resolve semantic placements to actual coordinates
pub fn resolve_placement(
    hint: &PlacementHint,
    canvas: [u32; 2],
    referenced_object_bbox: Option<[f64; 4]>, // [x1, y1, x2, y2]
) -> [f64; 2] {
    let [cw, ch] = [canvas[0] as f64, canvas[1] as f64];

    let base = match hint.semantic.as_str() {
        "center" => [cw / 2.0, ch / 2.0],
        "top-center" => [cw / 2.0, ch * 0.15],
        "top-left" => [cw * 0.1, ch * 0.1],
        "top-right" => [cw * 0.9, ch * 0.1],
        "bottom-center" => [cw / 2.0, ch * 0.85],
        "bottom-left" => [cw * 0.1, ch * 0.9],
        "bottom-right" => [cw * 0.9, ch * 0.9],
        "left-center" => [cw * 0.1, ch / 2.0],
        "right-center" => [cw * 0.9, ch / 2.0],
        _ => [cw / 2.0, ch / 2.0], // default to center
    };

    // Apply relative offset if referencing another object
    let adjusted = if let Some(rel) = &hint.relative {
        if let Some(bbox) = referenced_object_bbox {
            let [x1, y1, x2, y2] = bbox;
            let obj_cx = (x1 + x2) / 2.0;
            let obj_cy = (y1 + y2) / 2.0;
            let obj_width = x2 - x1;
            let obj_height = y2 - y1;

            if rel.starts_with("right_of:") {
                [obj_cx + obj_width / 2.0 + 30.0, obj_cy]
            } else if rel.starts_with("left_of:") {
                [obj_cx - obj_width / 2.0 - 30.0, obj_cy]
            } else if rel.starts_with("below:") {
                [obj_cx, obj_cy + obj_height / 2.0 + 30.0]
            } else if rel.starts_with("above:") {
                [obj_cx, obj_cy - obj_height / 2.0 - 30.0]
            } else {
                base
            }
        } else {
            base
        }
    } else {
        base
    };

    // Apply explicit offset

    if let Some([dx, dy]) = hint.offset {
        [adjusted[0] + dx as f64, adjusted[1] + dy as f64]
    } else {
        adjusted
    }
}

/// Convert size hint to actual dimensions
pub fn resolve_size(hint: Option<&str>) -> [f64; 2] {
    match hint {
        Some("small") => [40.0, 40.0],
        Some("medium") => [80.0, 80.0],
        Some("large") => [150.0, 150.0],
        Some("xlarge") => [200.0, 200.0],
        _ => [60.0, 60.0],
    }
}

/// Validate a plan for basic issues
pub fn validate_plan(plan: &DrawingPlan) -> Vec<String> {
    let mut issues = Vec::new();

    if plan.objects.is_empty() {
        issues.push("Plan has no objects".to_string());
    }

    // Check for duplicate IDs
    let mut ids = std::collections::HashSet::new();
    for obj in &plan.objects {
        if ids.contains(&obj.id) {
            issues.push(format!("Duplicate object ID: {}", obj.id));
        }
        ids.insert(obj.id.clone());
    }

    // Check for valid kind
    let valid_kinds = [
        "text", "circle", "rect", "line", "arrow", "diagram", "shape",
    ];
    for obj in &plan.objects {
        if !valid_kinds.contains(&obj.kind.as_str()) {
            issues.push(format!(
                "Unknown object kind '{}' for object '{}'",
                obj.kind, obj.id
            ));
        }
    }

    issues
}

/// Format plan as JSON for LLM consumption
pub fn plan_to_json(plan: &DrawingPlan) -> Value {
    json!({
        "title": plan.title,
        "canvas": plan.canvas,
        "estimated_steps": plan.estimated_steps,
        "objects": plan.objects.iter().map(|obj| {
            json!({
                "id": obj.id,
                "kind": obj.kind,
                "description": obj.description,
                "placement": {
                    "semantic": obj.placement.semantic,
                    "relative": obj.placement.relative,
                    "offset": obj.placement.offset,
                },
                "layer": obj.layer,
                "size": obj.size,
                "style": obj.style,
            })
        }).collect::<Vec<_>>()
    })
}

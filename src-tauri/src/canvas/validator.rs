/// Canvas Constraint Validator & Auto-Fixer
/// Detects layout issues and provides correction suggestions
use serde::{Deserialize, Serialize};
// use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutIssue {
    pub severity: String, // "error" | "warning" | "info"
    pub code: String,     // e.g., "overlap", "out_of_bounds"
    pub message: String,
    pub affected_objects: Vec<String>,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub issues: Vec<LayoutIssue>,
    pub auto_fixes_available: bool,
}

/// Check for overlapping bounding boxes
fn check_overlap(bbox1: [f64; 4], bbox2: [f64; 4], margin: f64) -> bool {
    let [x1_min, y1_min, x1_max, y1_max] = bbox1;
    let [x2_min, y2_min, x2_max, y2_max] = bbox2;

    // Check with margin
    !(x1_max + margin < x2_min
        || x2_max + margin < x1_min
        || y1_max + margin < y2_min
        || y2_max + margin < y1_min)
}

/// Check if bbox is within canvas bounds
fn check_bounds(bbox: [f64; 4], canvas: [u32; 2], margin: f64) -> bool {
    let [x_min, y_min, x_max, y_max] = bbox;
    let [cw, ch] = [canvas[0] as f64, canvas[1] as f64];

    x_min >= -margin && y_min >= -margin && x_max <= cw + margin && y_max <= ch + margin
}

/// Validate a collection of objects (bboxes)
pub fn validate_layout(
    objects: &[(String, [f64; 4])], // (id, bbox)
    canvas: [u32; 2],
    constraints: Option<LayoutConstraints>,
) -> ValidationResult {
    let constraints = constraints.unwrap_or_default();
    let mut issues = Vec::new();

    // Check bounds for each object
    for (id, bbox) in objects {
        if !check_bounds(*bbox, canvas, constraints.margin) {
            issues.push(LayoutIssue {
                severity: "error".to_string(),
                code: "out_of_bounds".to_string(),
                message: format!("Object '{}' extends beyond canvas boundaries", id),
                affected_objects: vec![id.clone()],
                suggestion: "Move object closer to canvas center or reduce size".to_string(),
            });
        }
    }

    // Check overlaps if enabled
    if constraints.no_overlap {
        for i in 0..objects.len() {
            for j in (i + 1)..objects.len() {
                let (id1, bbox1) = &objects[i];
                let (id2, bbox2) = &objects[j];

                if check_overlap(*bbox1, *bbox2, constraints.margin) {
                    issues.push(LayoutIssue {
                        severity: "warning".to_string(),
                        code: "overlap".to_string(),
                        message: format!("Objects '{}' and '{}' overlap", id1, id2),
                        affected_objects: vec![id1.clone(), id2.clone()],
                        suggestion: format!(
                            "Move '{}' {} pixels to the right",
                            id2,
                            constraints.margin as i32 + 20
                        ),
                    });
                }
            }
        }
    }

    // Check if canvas center is too crowded
    if constraints.keep_center_clear {
        let center_bbox = [
            canvas[0] as f64 * 0.35,
            canvas[1] as f64 * 0.35,
            canvas[0] as f64 * 0.65,
            canvas[1] as f64 * 0.65,
        ];

        let mut center_crowding = 0;
        for (_id, bbox) in objects {
            if check_overlap(*bbox, center_bbox, -5.0) {
                center_crowding += 1;
            }
        }

        if center_crowding > 1 {
            issues.push(LayoutIssue {
                severity: "info".to_string(),
                code: "center_crowded".to_string(),
                message: "Multiple objects near canvas center".to_string(),
                affected_objects: objects
                    .iter()
                    .filter(|(_, bbox)| check_overlap(*bbox, center_bbox, -5.0))
                    .map(|(id, _)| id.clone())
                    .collect(),
                suggestion: "Consider spreading objects toward edges for cleaner layout"
                    .to_string(),
            });
        }
    }

    let is_valid = issues.iter().all(|i| i.severity != "error");
    let auto_fixes_available = !issues.is_empty();

    ValidationResult {
        is_valid,
        issues,
        auto_fixes_available,
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LayoutConstraints {
    /// Enforce minimum margin between objects (pixels)
    pub margin: f64,
    /// No overlapping objects allowed
    pub no_overlap: bool,
    /// Keep center 30% of canvas clear
    pub keep_center_clear: bool,
    /// Maximum allowed objects on canvas
    pub max_objects: Option<usize>,
}

/// Attempt to auto-fix layout issues
pub fn auto_fix_layout(
    objects: &mut Vec<(String, [f64; 4])>,
    canvas: [u32; 2],
) -> Vec<String> {
    let mut fixes = Vec::new();
    let [cw, ch] = [canvas[0] as f64, canvas[1] as f64];

    for (id, bbox) in objects.iter_mut() {
        let [mut x_min, mut y_min, mut x_max, mut y_max] = bbox;
        let width = x_max - x_min;
        let height = y_max - y_min;

        // Clamp to bounds
        if x_min < 0.0 {
            x_min = 10.0;
            x_max = x_min + width;
            fixes.push(format!("Moved '{}' right to fit bounds", id));
        }
        if x_max > cw {
            x_max = cw - 10.0;
            x_min = x_max - width;
            fixes.push(format!("Moved '{}' left to fit bounds", id));
        }
        if y_min < 0.0 {
            y_min = 10.0;
            y_max = y_min + height;
            fixes.push(format!("Moved '{}' down to fit bounds", id));
        }
        if y_max > ch {
            y_max = ch - 10.0;
            y_min = y_max - height;
            fixes.push(format!("Moved '{}' up to fit bounds", id));
        }

        *bbox = [x_min, y_min, x_max, y_max];
    }

    // Simple overlap resolution: shift objects slightly
    for i in 0..objects.len() {
        for j in (i + 1)..objects.len() {
            let bbox1 = objects[i].1;
            let bbox2 = objects[j].1;

            if check_overlap(bbox1, bbox2, 10.0) {
                // Shift object j to the right
                let [x1, y1, x2, y2] = objects[j].1;
                let shift = (bbox1[2] - x1) + 20.0;
                objects[j].1 = [x1 + shift, y1, x2 + shift, y2];
                fixes.push(format!(
                    "Shifted '{}' right to avoid overlap with '{}'",
                    objects[j].0, objects[i].0
                ));
            }
        }
    }

    fixes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overlap_detection() {
        let bbox1 = [10.0, 10.0, 100.0, 100.0];
        let bbox2 = [80.0, 80.0, 150.0, 150.0];
        assert!(check_overlap(bbox1, bbox2, 0.0));

        let bbox3 = [150.0, 10.0, 200.0, 100.0];
        assert!(!check_overlap(bbox1, bbox3, 0.0));
    }

    #[test]
    fn test_bounds_check() {
        let canvas = [800, 600];
        let bbox1 = [50.0, 50.0, 100.0, 100.0];
        assert!(check_bounds(bbox1, canvas, 0.0));

        let bbox2 = [-10.0, 50.0, 100.0, 100.0];
        assert!(!check_bounds(bbox2, canvas, 0.0));
    }
}

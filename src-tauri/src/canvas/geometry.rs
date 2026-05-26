/// Geometry Helper Functions
/// Provides math utilities to offload spatial reasoning from LLM
use serde_json::json;

#[derive(Debug, Clone)]
pub struct GeometryContext {
    pub canvas_width: f64,
    pub canvas_height: f64,
    pub objects: Vec<(String, [f64; 4])>, // (id, bbox)
}

impl GeometryContext {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            canvas_width: width,
            canvas_height: height,
            objects: Vec::new(),
        }
    }

    /// Get canvas center
    pub fn canvas_center(&self) -> [f64; 2] {
        [self.canvas_width / 2.0, self.canvas_height / 2.0]
    }

    /// Get bounding box of an object
    pub fn get_bbox(&self, id: &str) -> Option<[f64; 4]> {
        self.objects
            .iter()
            .find(|(obj_id, _)| obj_id == id)
            .map(|(_, bbox)| *bbox)
    }

    /// Get center of an object
    pub fn get_center(&self, id: &str) -> Option<[f64; 2]> {
        self.get_bbox(id)
            .map(|[x1, y1, x2, y2]| [(x1 + x2) / 2.0, (y1 + y2) / 2.0])
    }

    /// Calculate distance between two objects
    pub fn distance(&self, id1: &str, id2: &str) -> Option<f64> {
        let c1 = self.get_center(id1)?;
        let c2 = self.get_center(id2)?;
        Some(((c1[0] - c2[0]).powi(2) + (c1[1] - c2[1]).powi(2)).sqrt())
    }

    /// Find largest free rectangular area on canvas
    pub fn find_free_space(&self) -> [f64; 4] {
        let mut largest = [0.0, 0.0, self.canvas_width, self.canvas_height];
        let mut largest_area = self.canvas_width * self.canvas_height;

        // Simple grid search for free quadrants
        let quadrants = [
            [0.0, 0.0, self.canvas_width / 2.0, self.canvas_height / 2.0],
            [
                self.canvas_width / 2.0,
                0.0,
                self.canvas_width,
                self.canvas_height / 2.0,
            ],
            [
                0.0,
                self.canvas_height / 2.0,
                self.canvas_width / 2.0,
                self.canvas_height,
            ],
            [
                self.canvas_width / 2.0,
                self.canvas_height / 2.0,
                self.canvas_width,
                self.canvas_height,
            ],
        ];

        for quad in &quadrants {
            let mut is_free = true;
            for (_, obj_bbox) in &self.objects {
                if Self::boxes_intersect(*quad, *obj_bbox) {
                    is_free = false;
                    break;
                }
            }

            if is_free {
                let area = (quad[2] - quad[0]) * (quad[3] - quad[1]);
                if area > largest_area {
                    largest = *quad;
                    largest_area = area;
                }
            }
        }

        largest
    }

    /// Get all objects in a region
    pub fn objects_in_region(&self, region: [f64; 4]) -> Vec<String> {
        self.objects
            .iter()
            .filter(|(_, bbox)| Self::boxes_intersect(region, *bbox))
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Suggest next free position (for incremental drawing)
    pub fn next_position(&self, preference: &str) -> [f64; 2] {
        match preference {
            "center" => self.canvas_center(),
            "top-left" => [self.canvas_width * 0.1, self.canvas_height * 0.1],
            "top-right" => [self.canvas_width * 0.9, self.canvas_height * 0.1],
            "bottom-left" => [self.canvas_width * 0.1, self.canvas_height * 0.9],
            "bottom-right" => [self.canvas_width * 0.9, self.canvas_height * 0.9],
            _ => {
                // Find least congested area
                let free_space = self.find_free_space();
                [
                    (free_space[0] + free_space[2]) / 2.0,
                    (free_space[1] + free_space[3]) / 2.0,
                ]
            }
        }
    }

    // Helper: check if two boxes intersect
    fn boxes_intersect(box1: [f64; 4], box2: [f64; 4]) -> bool {
        let [x1_min, y1_min, x1_max, y1_max] = box1;
        let [x2_min, y2_min, x2_max, y2_max] = box2;

        !(x1_max < x2_min || x2_max < x1_min || y1_max < y2_min || y2_max < y1_min)
    }

    /// Snap position to grid
    pub fn snap_to_grid(&self, pos: [f64; 2], grid_size: f64) -> [f64; 2] {
        [
            (pos[0] / grid_size).round() * grid_size,
            (pos[1] / grid_size).round() * grid_size,
        ]
    }

    /// Align position relative to another object
    pub fn align_relative(&self, to_id: &str, direction: &str, offset: f64) -> Option<[f64; 2]> {
        let bbox = self.get_bbox(to_id)?;
        let [x1, y1, x2, y2] = bbox;
        let center = [(x1 + x2) / 2.0, (y1 + y2) / 2.0];

        Some(match direction {
            "right" => [x2 + offset, center[1]],
            "left" => [x1 - offset, center[1]],
            "below" => [center[0], y2 + offset],
            "above" => [center[0], y1 - offset],
            _ => center,
        })
    }
}

/// Generate helper function hints for LLM
pub fn generate_geometry_hints(ctx: &GeometryContext) -> String {
    let mut hints = String::new();
    hints.push_str("\n## Geometry Helpers (Use These!)\n");
    hints.push_str("These functions automatically compute positions. Use them instead of guessing coordinates:\n\n");

    hints.push_str(&format!(
        "- canvas_center() → [{}, {}]\n",
        ctx.canvas_center()[0] as i32,
        ctx.canvas_center()[1] as i32
    ));

    if !ctx.objects.is_empty() {
        hints.push_str("- get_center(\"OBJECT_ID\") → [x, y]\n");
        hints.push_str("- align_relative(\"OBJECT_ID\", \"right\"|\"left\"|\"below\"|\"above\", offset) → [x, y]\n");
    }

    hints.push_str("- find_free_space() → [x1, y1, x2, y2]\n");
    hints.push_str("- snap_to_grid(x, y, 10) → snap to 10px grid\n\n");

    if !ctx.objects.is_empty() {
        hints.push_str(&format!("Current objects ({}):\n", ctx.objects.len()));
        for (id, bbox) in &ctx.objects {
            let [x1, y1, x2, y2] = bbox;
            hints.push_str(&format!(
                "- {} bbox=[{}, {}, {}, {}]\n",
                id, *x1 as i32, *y1 as i32, *x2 as i32, *y2 as i32
            ));
        }
    }

    hints
}

/// Export context as JSON for LLM
pub fn context_to_json(ctx: &GeometryContext) -> serde_json::Value {
    json!({
        "canvas": [ctx.canvas_width as i32, ctx.canvas_height as i32],
        "center": ctx.canvas_center(),
        "free_space": ctx.find_free_space(),
        "objects": ctx.objects.iter().map(|(id, bbox)| {
            let [x1, y1, x2, y2] = bbox;
            json!({
                "id": id,
                "bbox": [*x1 as i32, *y1 as i32, *x2 as i32, *y2 as i32],
                "center": [(*x1 + *x2) / 2.0, (*y1 + *y2) / 2.0],
                "width": (*x2 - *x1) as i32,
                "height": (*y2 - *y1) as i32,
            })
        }).collect::<Vec<_>>()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_center() {
        let ctx = GeometryContext::new(800.0, 600.0);
        assert_eq!(ctx.canvas_center(), [400.0, 300.0]);
    }

    #[test]
    fn test_distance() {
        let mut ctx = GeometryContext::new(800.0, 600.0);
        ctx.objects
            .push(("a".to_string(), [0.0, 0.0, 100.0, 100.0]));
        ctx.objects
            .push(("b".to_string(), [200.0, 0.0, 300.0, 100.0]));

        let dist = ctx.distance("a", "b").unwrap();
        assert!((dist - 200.0).abs() < 1.0); // centers are 100px apart horizontally
    }

    #[test]
    fn test_snap_to_grid() {
        let ctx = GeometryContext::new(800.0, 600.0);
        let snapped = ctx.snap_to_grid([47.0, 53.0], 10.0);
        assert_eq!(snapped, [50.0, 50.0]);
    }
}

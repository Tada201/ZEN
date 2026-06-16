use anyhow::{bail, Result};
/// Anchor System - Relative Positioning for Stable Layouts
/// Allows LLM to place objects relative to canvas or other objects
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AnchorType {
    /// Canvas-based anchors: "canvas.center", "canvas.top_left", etc.
    Canvas(String),
    /// Object-based anchors: "circle1.bottom", "rect1.right", etc.
    Object { object_id: String, point: String },
}

impl std::fmt::Display for AnchorType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AnchorType::Canvas(point) => write!(f, "canvas.{}", point),
            AnchorType::Object { object_id, point } => write!(f, "{}.{}", object_id, point),
        }
    }
}

impl AnchorType {
    /// Parse anchor string: "canvas.center" or "circle1.bottom"
    pub fn parse(anchor_str: &str) -> Result<Self> {
        let parts: Vec<&str> = anchor_str.split('.').collect();

        if parts.len() != 2 {
            bail!("Invalid anchor format. Expected 'canvas.POINT' or 'OBJECT_ID.POINT'");
        }

        let base = parts[0];
        let point = parts[1];

        if base == "canvas" {
            Ok(AnchorType::Canvas(point.to_string()))
        } else {
            Ok(AnchorType::Object {
                object_id: base.to_string(),
                point: point.to_string(),
            })
        }
    }
}

/// Computed position from an anchor
#[derive(Debug, Clone, Copy)]
pub struct AnchorPoint {
    pub x: f64,
    pub y: f64,
}

/// Anchor resolver - converts anchor references to coordinates
pub struct AnchorResolver {
    canvas_width: f64,
    canvas_height: f64,
    /// objects: id -> bbox [x1, y1, x2, y2]
    objects: HashMap<String, [f64; 4]>,
}

impl AnchorResolver {
    pub fn new(canvas_width: f64, canvas_height: f64) -> Self {
        Self {
            canvas_width,
            canvas_height,
            objects: HashMap::new(),
        }
    }

    /// Register an object's bounding box
    pub fn register_object(&mut self, id: String, bbox: [f64; 4]) {
        self.objects.insert(id, bbox);
    }

    /// Resolve an anchor to a coordinate
    pub fn resolve(&self, anchor: &AnchorType) -> Result<AnchorPoint> {
        match anchor {
            AnchorType::Canvas(point) => self.resolve_canvas_anchor(point),
            AnchorType::Object { object_id, point } => {
                let bbox = self
                    .objects
                    .get(object_id)
                    .ok_or_else(|| anyhow::anyhow!("Object '{}' not found", object_id))?;
                self.resolve_object_anchor(bbox, point)
            }
        }
    }

    /// Resolve canvas anchors: "center", "top", "bottom_left", etc.
    fn resolve_canvas_anchor(&self, point: &str) -> Result<AnchorPoint> {
        let cw = self.canvas_width;
        let ch = self.canvas_height;

        let (x, y) = match point {
            // Centers
            "center" => (cw / 2.0, ch / 2.0),
            // Edges
            "top" => (cw / 2.0, 0.0),
            "bottom" => (cw / 2.0, ch),
            "left" => (0.0, ch / 2.0),
            "right" => (cw, ch / 2.0),
            // Corners
            "top_left" => (0.0, 0.0),
            "top_right" => (cw, 0.0),
            "bottom_left" => (0.0, ch),
            "bottom_right" => (cw, ch),
            // Thirds (common for design)
            "top_center" => (cw / 2.0, ch / 3.0),
            "bottom_center" => (cw / 2.0, 2.0 * ch / 3.0),
            "left_center" => (cw / 3.0, ch / 2.0),
            "right_center" => (2.0 * cw / 3.0, ch / 2.0),
            _ => bail!("Unknown canvas anchor point: '{}'", point),
        };

        Ok(AnchorPoint { x, y })
    }

    /// Resolve object anchors: "center", "top", "bottom_right", etc.
    fn resolve_object_anchor(&self, bbox: &[f64; 4], point: &str) -> Result<AnchorPoint> {
        let [x1, y1, x2, y2] = *bbox;
        let cx = (x1 + x2) / 2.0;
        let cy = (y1 + y2) / 2.0;

        let (x, y) = match point {
            // Center
            "center" => (cx, cy),
            // Edges
            "top" => (cx, y1),
            "bottom" => (cx, y2),
            "left" => (x1, cy),
            "right" => (x2, cy),
            // Corners
            "top_left" => (x1, y1),
            "top_right" => (x2, y1),
            "bottom_left" => (x1, y2),
            "bottom_right" => (x2, y2),
            _ => bail!("Unknown object anchor point: '{}'", point),
        };

        Ok(AnchorPoint { x, y })
    }

    /// Apply anchor + offset to get final position
    pub fn resolve_with_offset(
        &self,
        anchor: &AnchorType,
        offset: Option<[f64; 2]>,
    ) -> Result<[f64; 2]> {
        let point = self.resolve(anchor)?;
        let [dx, dy] = offset.unwrap_or([0.0, 0.0]);
        Ok([point.x + dx, point.y + dy])
    }
}

/// Extended TOON command with anchor support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchorDrawCommand {
    /// Shape type: "circle", "rect", "text", etc.
    pub shape: String,

    /// Anchor for positioning
    pub anchor: Option<String>, // "canvas.center" or "circle1.bottom"

    /// Offset from anchor [dx, dy]
    #[serde(default)]
    pub offset: [f64; 2],

    /// Shape parameters (depends on shape type)
    pub params: serde_json::Value,

    /// Z-index layer
    #[serde(default)]
    pub layer: u32,
}

/// Convert anchor-based command to absolute coordinates
pub fn compile_anchor_command(
    cmd: &AnchorDrawCommand,
    resolver: &AnchorResolver,
) -> Result<serde_json::Value> {
    // Resolve position if anchor is provided
    let pos = if let Some(anchor_str) = &cmd.anchor {
        let anchor = AnchorType::parse(anchor_str)?;
        resolver.resolve_with_offset(&anchor, Some(cmd.offset))?
    } else {
        // Fallback to direct coordinates if provided in params
        let x = cmd.params.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let y = cmd.params.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
        [x, y]
    };

    // Build absolute TOON command
    let mut result = cmd.params.clone();
    result["x"] = json!(pos[0]);
    result["y"] = json!(pos[1]);
    result["layer"] = json!(cmd.layer);

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_canvas_anchor() {
        let anchor = AnchorType::parse("canvas.center").unwrap();
        assert_eq!(anchor, AnchorType::Canvas("center".to_string()));
    }

    #[test]
    fn test_parse_object_anchor() {
        let anchor = AnchorType::parse("circle1.bottom").unwrap();
        match anchor {
            AnchorType::Object { object_id, point } => {
                assert_eq!(object_id, "circle1");
                assert_eq!(point, "bottom");
            }
            _ => panic!("Wrong anchor type expected Object anchor"),
        }
    }

    #[test]
    fn test_canvas_center() {
        let resolver = AnchorResolver::new(800.0, 600.0);
        let anchor = AnchorType::Canvas("center".to_string());
        let point = resolver.resolve(&anchor).unwrap();
        assert_eq!(point.x, 400.0);
        assert_eq!(point.y, 300.0);
    }

    #[test]
    fn test_object_anchor() {
        let mut resolver = AnchorResolver::new(800.0, 600.0);
        resolver.register_object("circle1".to_string(), [300.0, 200.0, 500.0, 400.0]);

        let anchor = AnchorType::Object {
            object_id: "circle1".to_string(),
            point: "center".to_string(),
        };
        let point = resolver.resolve(&anchor).unwrap();
        assert_eq!(point.x, 400.0);
        assert_eq!(point.y, 300.0);
    }

    #[test]
    fn test_offset() {
        let resolver = AnchorResolver::new(800.0, 600.0);
        let anchor = AnchorType::Canvas("center".to_string());
        let pos = resolver
            .resolve_with_offset(&anchor, Some([50.0, -30.0]))
            .unwrap();
        assert_eq!(pos[0], 450.0);
        assert_eq!(pos[1], 270.0);
    }
}

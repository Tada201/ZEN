use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::agent::tools::AgentTool;
use anyhow::Result;

const MAX_BOARD_BLOCKS: usize = 12;
const MAX_BOARD_PAYLOAD_BYTES: usize = 256 * 1024;
const MAX_TEXT_CHARS: usize = 32 * 1024;

/// Board block types matching the frontend voice stage store.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BoardBlockKind {
    Note,
    Metric,
    Table,
    Chart,
    Equation,
    Code,
    MapPlaceholder,
    Map,
    Image,
    LinkPreview,
    Video,
    Camera,
    GenUi,
    PremiumCard,
    Html,
    Progress,
    Divider,
    Svg,
    Qr,
    Palette,
    Kroki,
    Diff,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BoardBlock {
    pub id: String,
    pub kind: BoardBlockKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<Vec<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<BoardChartPoint>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_type: Option<String>,
    // New media types
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub markup: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub names: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagram: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_label: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BoardChartPoint {
    pub label: String,
    pub value: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum BoardOperation {
    /// Set the entire board — replaces all blocks.
    Set {
        blocks: Vec<BoardBlock>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        layout: Option<String>,
    },
    /// Add a single block to the board.
    Add { block: BoardBlock },
    /// Update an existing block by ID.
    Update { id: String, block: BoardBlock },
    /// Remove a block by ID.
    Remove { id: String },
    /// Clear all blocks.
    Clear,
    /// Focus a specific block by ID (UI scroll/focus).
    Focus { id: String },
}

pub struct ManageBoardTool;

impl Default for ManageBoardTool {
    fn default() -> Self {
        Self::new()
    }
}

impl ManageBoardTool {
    pub fn new() -> Self {
        Self
    }
}

fn validate_text(label: &str, value: Option<&str>, max_chars: usize) -> Result<()> {
    if value.is_some_and(|text| text.chars().count() > max_chars) {
        anyhow::bail!("Board {} exceeds the {} character limit", label, max_chars);
    }
    Ok(())
}

fn validate_finite(label: &str, value: Option<f64>) -> Result<()> {
    if let Some(value) = value {
        if !value.is_finite() {
            anyhow::bail!("Board {} must be a finite number", label);
        }
    }
    Ok(())
}

fn validate_block(block: &BoardBlock) -> Result<()> {
    validate_finite("latitude", block.latitude)?;
    validate_finite("longitude", block.longitude)?;
    validate_finite("zoom", block.zoom)?;
    validate_finite("max", block.max)?;
    if let Some(points) = block.points.as_ref() {
        for point in points {
            if !point.value.is_finite() {
                anyhow::bail!("Board chart points must be finite numbers");
            }
        }
    }
    validate_text("block id", Some(&block.id), 128)?;
    validate_text("title", block.title.as_deref(), 512)?;
    validate_text("body", block.body.as_deref(), MAX_TEXT_CHARS)?;
    validate_text("code", block.code.as_deref(), MAX_TEXT_CHARS)?;
    validate_text("SVG", block.markup.as_deref(), 64 * 1024)?;
    validate_text("content", block.content.as_deref(), 64 * 1024)?;
    validate_text("URL", block.url.as_deref(), 4096)?;
    validate_text("QR data", block.data.as_deref(), 4096)?;
    if let Some(layout) = block.layout.as_ref().and_then(serde_json::Value::as_object) {
        let integer = |name: &str| layout.get(name).and_then(serde_json::Value::as_i64);
        let cell = integer("cell");
        let row = integer("row").or_else(|| cell.map(|value| value / 4));
        let column = integer("column").or_else(|| cell.map(|value| value % 4));
        let col_span = integer("col_span").unwrap_or(1);
        let row_span = integer("row_span").unwrap_or(1);
        if cell.is_some_and(|value| !(0..=15).contains(&value)) {
            anyhow::bail!("Board layout cell must be between 0 and 15");
        }
        if row.is_some_and(|value| !(0..=3).contains(&value))
            || column.is_some_and(|value| !(0..=3).contains(&value))
        {
            anyhow::bail!("Board layout row and column must be between 0 and 3");
        }
        if !(1..=4).contains(&col_span) || !(1..=4).contains(&row_span) {
            anyhow::bail!("Board layout spans must be between 1 and 4");
        }
        if column.is_some_and(|value| value + col_span > 4)
            || row.is_some_and(|value| value + row_span > 4)
        {
            anyhow::bail!("Board widget span exceeds the 4x4 grid boundary");
        }
    }
    if block
        .columns
        .as_ref()
        .is_some_and(|columns| columns.len() > 12)
    {
        anyhow::bail!("Board tables support at most 12 columns");
    }
    if block.rows.as_ref().is_some_and(|rows| rows.len() > 100) {
        anyhow::bail!("Board tables support at most 100 rows");
    }
    if block
        .points
        .as_ref()
        .is_some_and(|points| points.len() > 50)
    {
        anyhow::bail!("Board charts support at most 50 points");
    }
    if block
        .chart_type
        .as_deref()
        .is_some_and(|kind| !matches!(kind, "bar" | "line"))
    {
        anyhow::bail!("Board chart_type must be bar or line");
    }
    if block
        .colors
        .as_ref()
        .is_some_and(|colors| colors.len() > 20)
    {
        anyhow::bail!("Board palettes support at most 20 colors");
    }
    match block.kind {
        BoardBlockKind::Map if (block.latitude.is_none() || block.longitude.is_none()) => {
            anyhow::bail!("Map blocks require latitude and longitude");
        }
        BoardBlockKind::Video | BoardBlockKind::Image | BoardBlockKind::LinkPreview
            if block.url.as_deref().is_none_or(str::is_empty) =>
        {
            anyhow::bail!("Media and link blocks require url");
        }
        BoardBlockKind::GenUi | BoardBlockKind::Html
            if block.content.as_deref().is_none_or(str::is_empty) =>
        {
            anyhow::bail!("Gen UI and HTML blocks require content");
        }
        BoardBlockKind::PremiumCard
            if (block.card_type.as_deref().is_none_or(str::is_empty)
                || block.card_data.is_none()) =>
        {
            anyhow::bail!("Premium card blocks require card_type and card_data");
        }
        BoardBlockKind::Svg if block.markup.as_deref().is_none_or(str::is_empty) => {
            anyhow::bail!("SVG blocks require markup");
        }
        _ => {}
    }
    Ok(())
}

fn validate_operation(operation: &BoardOperation) -> Result<()> {
    match operation {
        BoardOperation::Set { blocks, layout, .. } => {
            if blocks.len() > MAX_BOARD_BLOCKS {
                anyhow::bail!("Voice boards support at most {} blocks", MAX_BOARD_BLOCKS);
            }
            if layout
                .as_deref()
                .is_some_and(|value| !matches!(value, "grid" | "dashboard" | "focus"))
            {
                anyhow::bail!("Board layout must be grid, dashboard, or focus");
            }
            for block in blocks {
                validate_block(block)?;
            }
            let mut occupied = std::collections::HashSet::new();
            for block in blocks {
                let Some(layout) = block.layout.as_ref().and_then(serde_json::Value::as_object)
                else {
                    continue;
                };
                let cell = layout.get("cell").and_then(serde_json::Value::as_i64);
                let row = layout
                    .get("row")
                    .and_then(serde_json::Value::as_i64)
                    .or_else(|| cell.map(|value| value / 4));
                let column = layout
                    .get("column")
                    .and_then(serde_json::Value::as_i64)
                    .or_else(|| cell.map(|value| value % 4));
                let (Some(row), Some(column)) = (row, column) else {
                    continue;
                };
                let col_span = layout
                    .get("col_span")
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or(1);
                let row_span = layout
                    .get("row_span")
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or(1);
                for y in row..row + row_span {
                    for x in column..column + col_span {
                        let cell = y * 4 + x;
                        if !occupied.insert(cell) {
                            anyhow::bail!("Board widgets overlap at cell {}", cell);
                        }
                    }
                }
            }
        }
        BoardOperation::Add { block } | BoardOperation::Update { block, .. } => {
            validate_block(block)?;
        }
        BoardOperation::Remove { id } | BoardOperation::Focus { id } => {
            validate_text("block id", Some(id), 128)?;
        }
        BoardOperation::Clear => {}
    }
    Ok(())
}

#[async_trait]
impl AgentTool for ManageBoardTool {
    fn id(&self) -> &str {
        "manage_board"
    }

    fn description(&self) -> &str {
        "Update the voice-mode board. Required shapes: set => {action:'set', blocks:[...]}; add => {action:'add', block:{...}}; update => {action:'update', id:'...', block:{...}}; remove/focus => {action:'remove'|'focus', id:'...'}; clear => {action:'clear'}. A drawing should normally use action 'set' with an SVG block inside the required blocks array. Never put block fields at the root."
    }

    fn input_schema(&self) -> Value {
        use serde_json::Map;

        let field =
            |kind: &str, description: &str| json!({ "type": kind, "description": description });
        let array_field = |description: &str| json!({ "type": "array", "items": { "type": "string" }, "description": description });

        let mut block_properties = Map::new();
        for (name, kind, description) in [
            ("id", "string", "Unique block identifier"),
            ("title", "string", "Block title"),
            ("body", "string", "Text body"),
            ("value", "string", "Metric value"),
            ("detail", "string", "Detail text"),
            ("language", "string", "Programming language"),
            ("expression", "string", "Math expression"),
            ("chart_type", "string", "Chart type: bar or line"),
            ("url", "string", "Media or link URL"),
            ("thumbnail", "string", "Thumbnail URL"),
            ("description", "string", "Description text"),
            ("size", "integer", "Size in pixels"),
            ("alt", "string", "Alternative text"),
            ("caption", "string", "Caption text"),
            ("location", "string", "Location name"),
            ("latitude", "number", "Map latitude"),
            ("longitude", "number", "Map longitude"),
            ("zoom", "number", "Map zoom"),
            ("code", "string", "Code content"),
            ("max", "number", "Maximum progress value"),
            ("label", "string", "Label text"),
            ("markup", "string", "Sanitized SVG markup"),
            ("data", "string", "QR data"),
            ("diagram", "string", "Diagram type"),
            ("content", "string", "Diagram, Gen UI, or HTML content"),
            ("card_type", "string", "Premium card type"),
            ("card_data", "object", "Structured premium-card data"),
            ("old_code", "string", "Original code"),
            ("new_code", "string", "New code"),
            ("old_label", "string", "Original code label"),
            ("new_label", "string", "New code label"),
        ] {
            block_properties.insert(name.to_string(), field(kind, description));
        }
        block_properties.insert("kind".to_string(), json!({
            "type": "string",
            "enum": ["note", "metric", "table", "chart", "equation", "code", "map", "map_placeholder", "image", "link_preview", "video", "camera", "gen_ui", "premium_card", "html", "progress", "divider", "svg", "qr", "palette", "kroki", "diff"]
        }));
        block_properties.insert("card_type".to_string(), json!({
            "type": "string",
            "enum": ["map", "composer", "stock", "financial", "flight", "package", "tracking", "product", "job", "event", "movie", "show", "book", "person", "contact", "nutrition", "food", "weather", "forecast", "sports", "match", "game", "metric", "stat", "kpi", "record", "datarecord", "entity", "comparison", "compare", "plans", "status", "alert", "notification"]
        }));
        block_properties.insert("columns".to_string(), array_field("Table columns"));
        block_properties.insert("colors".to_string(), array_field("Palette colors"));
        block_properties.insert("names".to_string(), array_field("Palette names"));
        block_properties.insert(
            "rows".to_string(),
            json!({
                "type": "array", "items": { "type": "array", "items": { "type": "string" } }
            }),
        );
        block_properties.insert(
            "points".to_string(),
            json!({
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": { "label": { "type": "string" }, "value": { "type": "number" } },
                    "required": ["label", "value"]
                }
            }),
        );
        block_properties.insert(
            "layout".to_string(),
            json!({
                "type": "object",
                "properties": {
                    "width": { "type": "string", "enum": ["small", "medium", "wide", "full"] },
                    "order": { "type": "integer" },
                    "col_span": { "type": "integer", "minimum": 1, "maximum": 4 },
                    "row_span": { "type": "integer", "minimum": 1, "maximum": 4 },
                    "cell": { "type": "integer", "minimum": 0, "maximum": 15 },
                    "row": { "type": "integer", "minimum": 0, "maximum": 3 },
                    "column": { "type": "integer", "minimum": 0, "maximum": 3 }
                },
                "additionalProperties": false
            }),
        );

        let mut block_schema = Map::new();
        block_schema.insert("type".to_string(), json!("object"));
        block_schema.insert("properties".to_string(), Value::Object(block_properties));
        block_schema.insert("required".to_string(), json!(["id", "kind"]));

        let mut properties = Map::new();
        properties.insert(
            "action".to_string(),
            json!({
                "type": "string", "enum": ["set", "add", "update", "remove", "clear", "focus"]
            }),
        );
        properties.insert("id".to_string(), field("string", "Block ID"));
        properties.insert(
            "blocks".to_string(),
            json!({
                "type": "array", "items": { "$ref": "#/$defs/block" }
            }),
        );
        properties.insert("block".to_string(), json!({ "$ref": "#/$defs/block" }));
        properties.insert("title".to_string(), field("string", "Board title"));
        properties.insert(
            "layout".to_string(),
            json!({
                "type": "string", "enum": ["grid", "dashboard", "focus"]
            }),
        );

        let mut definitions = Map::new();
        definitions.insert("block".to_string(), Value::Object(block_schema));
        let mut root = Map::new();
        root.insert("type".to_string(), json!("object"));
        root.insert("properties".to_string(), Value::Object(properties));
        root.insert("required".to_string(), json!(["action"]));
        root.insert("$defs".to_string(), Value::Object(definitions));

        let mut schema = Value::Object(root);
        schema["allOf"] = json!([
            {
                "if": { "properties": { "action": { "const": "set" } } },
                "then": { "required": ["blocks"] }
            },
            {
                "if": { "properties": { "action": { "const": "add" } } },
                "then": { "required": ["block"] }
            },
            {
                "if": { "properties": { "action": { "const": "update" } } },
                "then": { "required": ["id", "block"] }
            },
            {
                "if": { "properties": { "action": { "enum": ["remove", "focus"] } } },
                "then": { "required": ["id"] }
            }
        ]);
        schema
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        if serde_json::to_vec(&input)?.len() > MAX_BOARD_PAYLOAD_BYTES {
            anyhow::bail!("Board update exceeds the 256 KiB payload limit");
        }
        let operation: BoardOperation = serde_json::from_value(input.clone())
            .map_err(|e| anyhow::anyhow!("Invalid board operation: {}. Input must be valid JSON matching the manage_board schema.", e))?;
        validate_operation(&operation)?;

        // Emit board update event to frontend
        let mut payload = serde_json::to_value(&operation)?;
        if let Some(object) = payload.as_object_mut() {
            object.insert("chat_id".to_string(), json!(chat_id));
            object.insert("version".to_string(), json!(1));
        }
        let _ = app.emit("board:update", payload);

        match &operation {
            BoardOperation::Set { blocks, title, .. } => {
                let count = blocks.len();
                let title_str = title.as_deref().unwrap_or("Untitled");
                Ok(
                    json!({ "status": "ok", "message": format!("Board set: {} with {} blocks", title_str, count) }),
                )
            }
            BoardOperation::Add { block } => Ok(
                json!({ "status": "ok", "message": format!("Block '{}' added to board", block.id) }),
            ),
            BoardOperation::Update { id, .. } => {
                Ok(json!({ "status": "ok", "message": format!("Block '{}' updated", id) }))
            }
            BoardOperation::Remove { id } => {
                Ok(json!({ "status": "ok", "message": format!("Block '{}' removed", id) }))
            }
            BoardOperation::Clear => Ok(json!({ "status": "ok", "message": "Board cleared" })),
            BoardOperation::Focus { id } => {
                Ok(json!({ "status": "ok", "message": format!("Focusing block '{}'", id) }))
            }
        }
    }

    /// Board operations are instant — they just emit events.
    fn timeout_seconds(&self) -> u64 {
        5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note_block(id: &str) -> BoardBlock {
        BoardBlock {
            id: id.to_string(),
            kind: BoardBlockKind::Note,
            title: Some("Status".to_string()),
            body: Some("Ready".to_string()),
            value: None,
            detail: None,
            language: None,
            expression: None,
            columns: None,
            rows: None,
            points: None,
            chart_type: None,
            url: None,
            thumbnail: None,
            description: None,
            size: None,
            alt: None,
            caption: None,
            location: None,
            latitude: None,
            longitude: None,
            zoom: None,
            code: None,
            max: None,
            label: None,
            markup: None,
            data: None,
            colors: None,
            names: None,
            diagram: None,
            content: None,
            card_type: None,
            card_data: None,
            layout: None,
            old_code: None,
            new_code: None,
            old_label: None,
            new_label: None,
        }
    }

    #[test]
    fn accepts_bounded_board_operation() {
        let operation = BoardOperation::Set {
            blocks: vec![note_block("status")],
            title: Some("Voice board".to_string()),
            layout: Some("grid".to_string()),
        };
        assert!(validate_operation(&operation).is_ok());
    }

    #[test]
    fn rejects_excessive_board_blocks() {
        let operation = BoardOperation::Set {
            blocks: (0..=MAX_BOARD_BLOCKS)
                .map(|index| note_block(&format!("block-{index}")))
                .collect(),
            title: None,
            layout: None,
        };
        assert!(validate_operation(&operation).is_err());
    }

    #[test]
    fn rejects_excessive_table_rows() {
        let mut block = note_block("table");
        block.kind = BoardBlockKind::Table;
        block.columns = Some(vec!["Value".to_string()]);
        block.rows = Some(vec![vec!["row".to_string()]; 101]);
        assert!(validate_block(&block).is_err());
    }

    #[test]
    fn rejects_nan_coordinates() {
        let mut block = note_block("map");
        block.kind = BoardBlockKind::Map;
        block.latitude = Some(f64::NAN);
        block.longitude = Some(0.0);
        assert!(validate_block(&block).is_err());
    }

    #[test]
    fn rejects_infinite_progress_max() {
        let mut block = note_block("progress");
        block.kind = BoardBlockKind::Progress;
        block.value = Some("50".to_string());
        block.max = Some(f64::INFINITY);
        assert!(validate_block(&block).is_err());
    }

    #[test]
    fn rejects_nan_chart_points() {
        use super::BoardChartPoint;
        let mut block = note_block("chart");
        block.kind = BoardBlockKind::Chart;
        block.points = Some(vec![BoardChartPoint {
            label: "a".to_string(),
            value: f64::NAN,
        }]);
        assert!(validate_block(&block).is_err());
    }
}

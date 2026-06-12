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
    Note, Metric, Table, Chart, Equation, Code, MapPlaceholder,
    Image, LinkPreview, Progress, Divider,
    Svg, Qr, Palette, Kroki, Diff,
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
    },
    /// Add a single block to the board.
    Add {
        block: BoardBlock,
    },
    /// Update an existing block by ID.
    Update {
        id: String,
        block: BoardBlock,
    },
    /// Remove a block by ID.
    Remove {
        id: String,
    },
    /// Clear all blocks.
    Clear,
    /// Focus a specific block by ID (UI scroll/focus).
    Focus {
        id: String,
    },
}

pub struct ManageBoardTool;

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

fn validate_block(block: &BoardBlock) -> Result<()> {
    validate_text("block id", Some(&block.id), 128)?;
    validate_text("title", block.title.as_deref(), 512)?;
    validate_text("body", block.body.as_deref(), MAX_TEXT_CHARS)?;
    validate_text("code", block.code.as_deref(), MAX_TEXT_CHARS)?;
    validate_text("SVG", block.markup.as_deref(), 64 * 1024)?;
    validate_text("diagram", block.content.as_deref(), MAX_TEXT_CHARS)?;
    validate_text("URL", block.url.as_deref(), 4096)?;
    validate_text("QR data", block.data.as_deref(), 4096)?;
    if block.columns.as_ref().is_some_and(|columns| columns.len() > 12) {
        anyhow::bail!("Board tables support at most 12 columns");
    }
    if block.rows.as_ref().is_some_and(|rows| rows.len() > 100) {
        anyhow::bail!("Board tables support at most 100 rows");
    }
    if block.points.as_ref().is_some_and(|points| points.len() > 50) {
        anyhow::bail!("Board charts support at most 50 points");
    }
    if block.colors.as_ref().is_some_and(|colors| colors.len() > 20) {
        anyhow::bail!("Board palettes support at most 20 colors");
    }
    Ok(())
}

fn validate_operation(operation: &BoardOperation) -> Result<()> {
    match operation {
        BoardOperation::Set { blocks, .. } => {
            if blocks.len() > MAX_BOARD_BLOCKS {
                anyhow::bail!("Voice boards support at most {} blocks", MAX_BOARD_BLOCKS);
            }
            for block in blocks {
                validate_block(block)?;
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
        "Update the scratch-pad board displayed in the voice/visual mode UI. You MUST specify an 'action' (set, add, update, remove, clear, focus). For 'add' or 'update', wrap the block properties (like id, kind, title, body, markup, url, etc.) inside the 'block' object field. Do not pass block properties at the root level. Always show data visually on the board when helpful instead of describing it in text."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["set", "add", "update", "remove", "clear", "focus"],
                    "description": "The operation to perform on the board"
                },
                "id": {
                    "type": "string",
                    "description": "Block ID for update, remove, or focus operations"
                },
                "blocks": {
                    "type": "array",
                    "description": "Array of blocks for 'set' operation",
                    "items": { "$ref": "#/$defs/block" }
                },
                "block": {
                    "$ref": "#/$defs/block",
                    "description": "Single block for 'add' or 'update' operations"
                },
                "title": {
                    "type": "string",
                    "description": "Optional title for the board"
                }
            },
            "required": ["action"],
            "$defs": {
                "block": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Unique block identifier (UUID recommended)" },
                        "kind": {
                            "type": "string",
                            "enum": ["note", "metric", "table", "chart", "equation", "code", "map_placeholder", "image", "link_preview", "progress", "divider", "svg", "qr", "palette", "kroki", "diff"],
                            "description": "Block type"
                        },
                        "title": { "type": "string", "description": "Block title" },
                        "body": { "type": "string", "description": "Text body (for note blocks)" },
                        "value": { "type": "string", "description": "Value display (for metric blocks)" },
                        "detail": { "type": "string", "description": "Detail/description (for metric or map blocks)" },
                        "language": { "type": "string", "description": "Programming language (for code blocks)" },
                        "expression": { "type": "string", "description": "Math expression (for equation blocks)" },
                        "columns": { "type": "array", "items": {"type": "string"}, "description": "Column headers (for table blocks)" },
                        "rows": { "type": "array", "items": {"type": "array", "items": {"type": "string"}}, "description": "Row data (for table blocks)" },
                        "points": { "type": "array", "items": {"type": "object", "properties": {"label": {"type": "string"}, "value": {"type": "number"}}}, "description": "Chart data points" },
                        "url": { "type": "string", "description": "URL (for image/link_preview blocks)" },
                        "thumbnail": { "type": "string", "description": "Thumbnail image URL (for link_preview blocks)" },
                        "description": { "type": "string", "description": "Description text (for link_preview blocks)" },
                        "size": { "type": "integer", "description": "Size in pixels (for qr blocks)" },
                        "alt": { "type": "string", "description": "Alt text (for image blocks)" },
                        "caption": { "type": "string", "description": "Caption text (for image blocks)" },
                        "location": { "type": "string", "description": "Location name or coordinates (for map_placeholder blocks)" },
                        "code": { "type": "string", "description": "Code content (for code blocks)" },
                        "max": { "type": "number", "description": "Maximum value (for progress blocks)" },
                        "label": { "type": "string", "description": "Label text (for progress blocks)" },
                        "markup": { "type": "string", "description": "Raw SVG markup (for svg blocks)" },
                        "data": { "type": "string", "description": "Data string (for qr blocks)" },
                        "colors": { "type": "array", "items": {"type": "string"}, "description": "Hex color array (for palette blocks)" },
                        "names": { "type": "array", "items": {"type": "string"}, "description": "Color names (for palette blocks)" },
                        "diagram": { "type": "string", "description": "Diagram type: graphviz, blockdiag, seqdiag, actdiag, nwdiag, packetdiag, rackdiag, c4plantuml, d2, dbml, erd, excalidraw, mermaid, nomnoml, pikchr, plantuml, svgbob, umlet, vega, vegalite, wavedrom (for kroki blocks)" },
                        "content": { "type": "string", "description": "Diagram source text (for kroki blocks)" },
                        "old_code": { "type": "string", "description": "Original code (for diff blocks)" },
                        "new_code": { "type": "string", "description": "New code (for diff blocks)" },
                        "old_label": { "type": "string", "description": "Label for old code column (for diff blocks)" },
                        "new_label": { "type": "string", "description": "Label for new code column (for diff blocks)" }
                    },
                    "required": ["id", "kind"]
                }
            }
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        if serde_json::to_vec(&input)?.len() > MAX_BOARD_PAYLOAD_BYTES {
            anyhow::bail!("Board update exceeds the 256 KiB payload limit");
        }
        let operation: BoardOperation = serde_json::from_value(input.clone())
            .map_err(|e| anyhow::anyhow!("Invalid board operation: {}. Input must be valid JSON matching the manage_board schema.", e))?;
        validate_operation(&operation)?;

        // Emit board update event to frontend
        let payload = serde_json::to_value(&operation)?;
        let _ = app.emit("board:update", payload);

        match &operation {
            BoardOperation::Set { blocks, title } => {
                let count = blocks.len();
                let title_str = title.as_deref().unwrap_or("Untitled");
                Ok(json!({ "status": "ok", "message": format!("Board set: {} with {} blocks", title_str, count) }))
            }
            BoardOperation::Add { block } => {
                Ok(json!({ "status": "ok", "message": format!("Block '{}' added to board", block.id) }))
            }
            BoardOperation::Update { id, .. } => {
                Ok(json!({ "status": "ok", "message": format!("Block '{}' updated", id) }))
            }
            BoardOperation::Remove { id } => {
                Ok(json!({ "status": "ok", "message": format!("Block '{}' removed", id) }))
            }
            BoardOperation::Clear => {
                Ok(json!({ "status": "ok", "message": "Board cleared" }))
            }
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
            url: None,
            thumbnail: None,
            description: None,
            size: None,
            alt: None,
            caption: None,
            location: None,
            code: None,
            max: None,
            label: None,
            markup: None,
            data: None,
            colors: None,
            names: None,
            diagram: None,
            content: None,
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
}

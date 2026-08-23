use anyhow::{bail, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub struct DrawTool;

// ── Persistent style state while parsing ──────────────────────────────────────
struct Style {
    stroke: Option<String>,
    fill: Option<String>,
    stroke_width: f64,
}

impl Style {
    fn new() -> Self {
        Self {
            stroke: Some("#ffffff".into()),
            fill: None,
            stroke_width: 2.0,
        }
    }

    fn to_json(&self) -> Value {
        json!({
            "stroke": self.stroke,
            "fill": self.fill,
            "strokeWidth": self.stroke_width,
        })
    }
}

// ── Color validation ──────────────────────────────────────────────────────────
fn resolve_color(s: &str) -> Result<String> {
    if s == "-" {
        return Ok("-".into());
    }
    match s.to_lowercase().as_str() {
        "black" => return Ok("#000000".into()),
        "white" => return Ok("#ffffff".into()),
        "red" => return Ok("#ff0000".into()),
        "green" => return Ok("#00ff00".into()),
        "blue" => return Ok("#0000ff".into()),
        "yellow" => return Ok("#ffff00".into()),
        "orange" => return Ok("#ffa500".into()),
        "purple" => return Ok("#800080".into()),
        "cyan" => return Ok("#00ffff".into()),
        "magenta" => return Ok("#ff00ff".into()),
        "pink" => return Ok("#ffc0cb".into()),
        "gray" | "grey" => return Ok("#808080".into()),
        "brown" => return Ok("#8b4513".into()),
        _ => {}
    }
    if let Some(hex) = s.strip_prefix('#') {
        let valid = matches!(hex.len(), 3 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
        if valid {
            return Ok(s.to_string());
        }
        bail!("invalid hex color: {s}");
    }
    bail!("unknown color: {s}");
}

fn parse_f64(tok: &str, line: usize) -> Result<f64> {
    tok.parse::<f64>()
        .map_err(|_| anyhow::anyhow!("line {line}: expected number, got '{tok}'"))
}

fn need(tokens: &[&str], n: usize, cmd: &str, line: usize) -> Result<()> {
    if tokens.len() < n {
        bail!(
            "line {line}: '{cmd}' requires at least {n} args, got {}",
            tokens.len()
        );
    }
    Ok(())
}

// ── Star point computation ────────────────────────────────────────────────────
fn star_points(cx: f64, cy: f64, outer: f64, inner: f64, n: usize) -> Vec<f64> {
    let mut pts = Vec::with_capacity(n * 4);
    let step = std::f64::consts::PI / n as f64;
    let offset = -std::f64::consts::FRAC_PI_2;
    for i in 0..(n * 2) {
        let r = if i % 2 == 0 { outer } else { inner };
        let angle = offset + step * i as f64;
        pts.push(cx + r * angle.cos());
        pts.push(cy + r * angle.sin());
    }
    pts
}

// ── TOON parser ───────────────────────────────────────────────────────────────
fn parse_toon(input: &str) -> Result<Vec<Value>> {
    let mut ops: Vec<Value> = Vec::new();
    let mut style = Style::new();

    for (idx, raw_line) in input.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let ln = idx + 1;

        // Special handling for `tx` command — need to preserve quoted text
        if line.starts_with("tx ") {
            let rest = line
                .strip_prefix("tx ")
                .ok_or_else(|| anyhow::anyhow!("line {ln}: 'tx' expected prefix 'tx '"))?;
            // find the quoted string
            let quote_start = rest
                .find('"')
                .ok_or_else(|| anyhow::anyhow!("line {ln}: 'tx' missing opening quote"))?;
            let before_quote = rest[..quote_start].trim();
            let after_quote_start = &rest[quote_start + 1..];
            let quote_end = after_quote_start
                .find('"')
                .ok_or_else(|| anyhow::anyhow!("line {ln}: 'tx' missing closing quote"))?;
            let text = &after_quote_start[..quote_end];

            let parts: Vec<&str> = before_quote.split_whitespace().collect();
            if parts.len() < 3 {
                bail!("line {ln}: 'tx' requires x y size \"text\"");
            }
            let x = parse_f64(parts[0], ln)?;
            let y = parse_f64(parts[1], ln)?;
            let size = parse_f64(parts[2], ln)?;

            ops.push(json!({
                "kind": "text",
                "x": x, "y": y,
                "size": size,
                "text": text,
                "style": style.to_json(),
            }));
            continue;
        }

        let tokens: Vec<&str> = line.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        let cmd = tokens[0];
        let args = &tokens[1..];

        match cmd {
            // ── style ─────────────────────────────────────────────────
            "s" => {
                need(args, 3, "s", ln)?;
                let stroke_col = resolve_color(args[0])
                    .map_err(|e| anyhow::anyhow!("line {ln}: stroke — {e}"))?;
                let fill_col =
                    resolve_color(args[1]).map_err(|e| anyhow::anyhow!("line {ln}: fill — {e}"))?;
                let w = parse_f64(args[2], ln)?;
                style.stroke = if stroke_col == "-" {
                    None
                } else {
                    Some(stroke_col)
                };
                style.fill = if fill_col == "-" {
                    None
                } else {
                    Some(fill_col)
                };
                style.stroke_width = w;
            }

            // ── background ────────────────────────────────────────────
            "bg" => {
                need(args, 1, "bg", ln)?;
                let col =
                    resolve_color(args[0]).map_err(|e| anyhow::anyhow!("line {ln}: bg — {e}"))?;
                ops.push(json!({ "kind": "bg", "color": col }));
            }

            // ── line ──────────────────────────────────────────────────
            "l" => {
                need(args, 4, "l", ln)?;
                ops.push(json!({
                    "kind": "line",
                    "x1": parse_f64(args[0], ln)?,
                    "y1": parse_f64(args[1], ln)?,
                    "x2": parse_f64(args[2], ln)?,
                    "y2": parse_f64(args[3], ln)?,
                    "style": style.to_json(),
                }));
            }

            // ── rectangle ─────────────────────────────────────────────
            "r" => {
                need(args, 4, "r", ln)?;
                ops.push(json!({
                    "kind": "rect",
                    "x": parse_f64(args[0], ln)?,
                    "y": parse_f64(args[1], ln)?,
                    "w": parse_f64(args[2], ln)?,
                    "h": parse_f64(args[3], ln)?,
                    "style": style.to_json(),
                }));
            }

            // ── circle ────────────────────────────────────────────────
            "c" => {
                need(args, 3, "c", ln)?;
                let radius = parse_f64(args[2], ln)?;
                if radius < 0.0 {
                    bail!("line {ln}: circle radius cannot be negative");
                }
                ops.push(json!({
                    "kind": "circle",
                    "x": parse_f64(args[0], ln)?,
                    "y": parse_f64(args[1], ln)?,
                    "r": radius,
                    "style": style.to_json(),
                }));
            }

            // ── ellipse ───────────────────────────────────────────────
            "e" => {
                need(args, 4, "e", ln)?;
                let rx = parse_f64(args[2], ln)?;
                let ry = parse_f64(args[3], ln)?;
                if rx < 0.0 || ry < 0.0 {
                    bail!("line {ln}: ellipse radii cannot be negative");
                }
                ops.push(json!({
                    "kind": "ellipse",
                    "x": parse_f64(args[0], ln)?,
                    "y": parse_f64(args[1], ln)?,
                    "rx": rx, "ry": ry,
                    "style": style.to_json(),
                }));
            }

            // ── polygon ───────────────────────────────────────────────
            "p" => {
                if args.len() < 4 || !args.len().is_multiple_of(2) {
                    bail!("line {ln}: 'p' requires an even number of coords (at least 4)");
                }
                let mut pts = Vec::new();
                for pair in args.chunks(2) {
                    pts.push(json!({
                        "x": parse_f64(pair[0], ln)?,
                        "y": parse_f64(pair[1], ln)?,
                    }));
                }
                ops.push(json!({
                    "kind": "polygon",
                    "points": pts,
                    "style": style.to_json(),
                }));
            }

            // ── freehand path ─────────────────────────────────────────
            "f" => {
                if args.len() < 4 || !args.len().is_multiple_of(2) {
                    bail!("line {ln}: 'f' requires an even number of coords (at least 4)");
                }
                let mut pts = Vec::new();
                for pair in args.chunks(2) {
                    pts.push(json!({
                        "x": parse_f64(pair[0], ln)?,
                        "y": parse_f64(pair[1], ln)?,
                    }));
                }
                ops.push(json!({
                    "kind": "path",
                    "points": pts,
                    "style": style.to_json(),
                }));
            }

            // ── arrow ─────────────────────────────────────────────────
            "ar" => {
                need(args, 4, "ar", ln)?;
                ops.push(json!({
                    "kind": "arrow",
                    "x1": parse_f64(args[0], ln)?,
                    "y1": parse_f64(args[1], ln)?,
                    "x2": parse_f64(args[2], ln)?,
                    "y2": parse_f64(args[3], ln)?,
                    "style": style.to_json(),
                }));
            }

            // ── triangle ──────────────────────────────────────────────
            "tr" => {
                need(args, 6, "tr", ln)?;
                let pts = vec![
                    json!({"x": parse_f64(args[0], ln)?, "y": parse_f64(args[1], ln)?}),
                    json!({"x": parse_f64(args[2], ln)?, "y": parse_f64(args[3], ln)?}),
                    json!({"x": parse_f64(args[4], ln)?, "y": parse_f64(args[5], ln)?}),
                ];
                ops.push(json!({
                    "kind": "polygon",
                    "points": pts,
                    "style": style.to_json(),
                }));
            }

            // ── star ──────────────────────────────────────────────────
            "st" => {
                need(args, 4, "st", ln)?;
                let cx = parse_f64(args[0], ln)?;
                let cy = parse_f64(args[1], ln)?;
                let outer = parse_f64(args[2], ln)?;
                let inner = parse_f64(args[3], ln)?;
                if outer < 0.0 || inner < 0.0 {
                    bail!("line {ln}: star radii cannot be negative");
                }
                let n = if args.len() > 4 {
                    args[4]
                        .parse::<usize>()
                        .map_err(|_| anyhow::anyhow!("line {ln}: star points must be integer"))?
                } else {
                    5
                };
                let coords = star_points(cx, cy, outer, inner, n);
                let pts: Vec<Value> = coords
                    .chunks(2)
                    .map(|c| json!({"x": c[0], "y": c[1]}))
                    .collect();
                ops.push(json!({
                    "kind": "polygon",
                    "points": pts,
                    "style": style.to_json(),
                }));
            }

            // ── eraser ────────────────────────────────────────────────
            "er" => {
                if args.len() < 3 || args.len() % 2 != 1 {
                    bail!("line {ln}: 'er' requires odd number of args (x y [x y ...] radius)");
                }
                let radius = parse_f64(args[args.len() - 1], ln)?;
                if radius < 0.0 {
                    bail!("line {ln}: eraser radius cannot be negative");
                }
                let mut pts = Vec::new();
                for pair in args[..args.len() - 1].chunks(2) {
                    pts.push(json!({
                        "x": parse_f64(pair[0], ln)?,
                        "y": parse_f64(pair[1], ln)?,
                    }));
                }
                ops.push(json!({
                    "kind": "eraser",
                    "points": pts,
                    "radius": radius,
                }));
            }

            // ── clear ─────────────────────────────────────────────────
            "cl" => {
                ops.push(json!({ "kind": "clear" }));
            }

            _ => {
                bail!("line {ln}: unknown command '{cmd}'");
            }
        }
    }

    Ok(ops)
}

// ── AgentTool impl ────────────────────────────────────────────────────────────
#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for DrawTool {
    fn id(&self) -> &str {
        "draw"
    }

    fn description(&self) -> &str {
        "Draw on a canvas (800x600, origin top-left) using compact TOON notation.\n\
         Pass the `t` parameter as a single string with one command per line (use \\n for newlines).\n\n\
         COMMANDS (one per line):\n\
         s STROKE FILL WIDTH  set style; persists until next s. FILL=- for transparent\n\
         l x1 y1 x2 y2       line\n\
         r x y w h            rectangle\n\
         c x y radius         circle\n\
         e x y rx ry          ellipse\n\
         p x1 y1 x2 y2 ...   polygon (even # of coords, min 4)\n\
         f x1 y1 x2 y2 ...   freehand path\n\
         tx x y size \"text\"   text (quoted)\n\
         ar x1 y1 x2 y2      arrow\n\
         tr x1 y1 x2 y2 x3 y3  triangle\n\
         st x y outer inner [n]  star (n=points, default 5)\n\
         er x y radius        eraser\n\
         bg COLOR              set background\n\
         cl                    clear all\n\n\
         COLORS: #RGB, #RRGGBB, #RRGGBBAA, or names: red blue green cyan yellow white black orange purple pink gray brown magenta\n\n\
         RULES:\n\
         - Always set style with `s` before drawing. Default is white stroke, no fill, 2px width.\n\
         - Coordinates are integers 0-800 (x) and 0-600 (y). Keep shapes inside bounds.\n\
         - Use a SINGLE tool call with ALL commands batched in one `t` string. Do NOT call draw multiple times.\n\
         - Separate commands with newlines (\\n in the JSON string value).\n\
         - Compose complex drawings by combining primitives (rects, circles, lines, etc.).\n\n\
         EXAMPLE - house with sun:\n\
         s #555 #87CEEB 2\\nr 200 250 200 150\\ntr 200 250 300 150 400 250\\ns #8B4513 #8B4513 2\\nr 275 330 50 70\\ns #FFD700 #FFD700 1\\nc 600 80 40\\ns #00ff00 #228B22 2\\nr 150 400 300 50\n\n\
         EXAMPLE - flowchart:\n\
         s #00e5ff - 2\\nr 300 20 200 60\\ntx 340 40 16 \"START\"\\nar 400 80 400 140\\nr 300 140 200 60\\ntx 330 160 16 \"PROCESS\"\\nar 400 200 400 260\\nc 400 300 40\\ntx 375 290 14 \"END\""
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "t": {
                    "type": "string",
                    "description": "TOON drawing commands as a single string. One command per line, separated by \\n. Always start with `s` to set style. Coordinates: x=0-800, y=0-600. Batch ALL drawing into one call."
                }
            },
            "required": ["t"],
            "additionalProperties": false
        })
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
        let toon = input
            .get("t")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: t"))?;

        let mut ops = parse_toon(toon)?;

        // Tag all operations with source="llm"
        for op in &mut ops {
            op["source"] = json!("llm");
        }

        let n = ops.len();

        // Build canvas summary: count shapes by kind
        let mut shape_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for op in &ops {
            if let Some(kind) = op.get("kind").and_then(|v| v.as_str()) {
                *shape_counts.entry(kind.to_string()).or_insert(0) += 1;
            }
        }
        let canvas_summary = if shape_counts.is_empty() {
            "No shapes drawn".to_string()
        } else {
            let parts: Vec<String> = shape_counts
                .iter()
                .map(|(kind, count)| format!("{} {}", count, kind))
                .collect();
            format!("Drew {}", parts.join(", "))
        };

        app.emit(
            "drawing:ops",
            json!({
                "chat_id": chat_id,
                "source": "llm",
                "ops": ops,
            }),
        )?;

        tracing::info!(ops_count = n, "DrawTool emitted {n} ops");

        Ok(json!({"ok": true, "n": n, "canvas_summary": canvas_summary}))
    }
}

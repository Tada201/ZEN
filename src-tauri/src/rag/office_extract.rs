//! Native (MSI-safe) office-document text extraction.
//!
//! Replaces the Python `markitdown` shell-out for the formats a chat
//! attachment can be. Everything here is pure Rust so the single-MSI release
//! carries no runtime dependency:
//!   - xlsx / xls / xlsb / ods  → `calamine`
//!   - docx / pptx              → `zip` + `quick-xml` over the OOXML parts
//!
//! Extraction is best-effort and text-only: formatting, images, and embedded
//! objects are dropped. The output feeds the on-demand read tool and token
//! estimate, not a faithful render.

use anyhow::{Context, Result};
use std::io::Read;
use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;

/// Upper bound on characters pulled from one spreadsheet, so a giant sheet
/// can't blow up memory or the token budget. ~1M chars ≈ 250k tokens; the
/// read tool paginates well before that.
const MAX_SHEET_CHARS: usize = 1_000_000;

/// Extract every sheet of a spreadsheet as tab-separated rows, prefixed with a
/// `## <sheet name>` header. Returns the joined text and the sheet names.
pub fn extract_spreadsheet(path: &Path) -> Result<(String, Vec<String>)> {
    let mut workbook =
        open_workbook_auto(path).with_context(|| format!("open workbook {}", path.display()))?;
    let names = workbook.sheet_names().to_vec();

    let mut out = String::new();
    for name in &names {
        let range = match workbook.worksheet_range(name) {
            Ok(r) => r,
            Err(_) => continue,
        };
        out.push_str("## ");
        out.push_str(name);
        out.push('\n');
        for row in range.rows() {
            let mut first = true;
            for cell in row {
                if !first {
                    out.push('\t');
                }
                first = false;
                push_cell(&mut out, cell);
            }
            out.push('\n');
            if out.len() >= MAX_SHEET_CHARS {
                out.push_str("\n... [TRUNCATED: spreadsheet exceeds extraction cap]\n");
                return Ok((out, names));
            }
        }
        out.push('\n');
    }
    Ok((out, names))
}

/// Cheap sheet-name probe (opens the workbook, reads names, no cell ranges).
/// Used to record `sheet_names` metadata without a full re-extraction.
pub fn spreadsheet_sheet_names(path: &Path) -> Result<Vec<String>> {
    let workbook =
        open_workbook_auto(path).with_context(|| format!("open workbook {}", path.display()))?;
    Ok(workbook.sheet_names().to_vec())
}

fn push_cell(out: &mut String, cell: &Data) {    match cell {
        Data::Empty => {}
        Data::String(s) => out.push_str(s),
        Data::Float(f) => out.push_str(&f.to_string()),
        Data::Int(i) => out.push_str(&i.to_string()),
        Data::Bool(b) => out.push_str(if *b { "TRUE" } else { "FALSE" }),
        Data::DateTime(d) => out.push_str(&d.to_string()),
        Data::DateTimeIso(s) => out.push_str(s),
        Data::DurationIso(s) => out.push_str(s),
        Data::Error(e) => out.push_str(&format!("#ERR({e:?})")),
    }
}

/// Extract visible text from a docx (`word/document.xml`) or pptx
/// (`ppt/slides/slideN.xml`). Reads `<w:t>` / `<a:t>` text runs and inserts a
/// newline on paragraph boundaries so the result is readable, not one line.
pub fn extract_ooxml(path: &Path) -> Result<String> {
    let file = std::fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut zip = zip::ZipArchive::new(file).with_context(|| "read OOXML zip container")?;

    // Collect the XML parts that hold body text, in a stable order.
    let mut parts: Vec<String> = Vec::new();
    for i in 0..zip.len() {
        let name = zip.by_index(i)?.name().to_string();
        let is_doc = name == "word/document.xml";
        let is_slide = name.starts_with("ppt/slides/slide") && name.ends_with(".xml");
        if is_doc || is_slide {
            parts.push(name);
        }
    }
    // Slides sort lexically as slide1, slide10, slide2 — fix numeric order.
    parts.sort_by(|a, b| slide_num(a).cmp(&slide_num(b)));

    let mut out = String::new();
    for part in parts {
        let mut xml = String::new();
        zip.by_name(&part)?.read_to_string(&mut xml)?;
        extract_ooxml_text(&xml, &mut out)?;
        out.push('\n');
    }
    if out.trim().is_empty() {
        anyhow::bail!("OOXML document contained no extractable text");
    }
    Ok(out)
}

/// Numeric slide index for ordering; documents (no digits) sort first.
fn slide_num(name: &str) -> u32 {
    name.trim_end_matches(".xml")
        .rsplit(|c: char| !c.is_ascii_digit())
        .find(|s| !s.is_empty())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Append the text-run content of one OOXML part to `out`. `<w:t>`/`<a:t>` hold
/// runs; `<w:p>`/`<a:p>` (paragraphs) and `<w:br>` become newlines.
fn extract_ooxml_text(xml: &str, out: &mut String) -> Result<()> {
    let mut reader = XmlReader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut in_text = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if is_text_tag(e.name().as_ref()) {
                    in_text = true;
                }
            }
            Ok(Event::End(e)) => {
                let n = e.name();
                let n = n.as_ref();
                if is_text_tag(n) {
                    in_text = false;
                } else if is_para_tag(n) {
                    out.push('\n');
                }
            }
            Ok(Event::Empty(e)) => {
                // Self-closing break tags.
                let n = e.name();
                if matches!(n.as_ref(), b"w:br" | b"a:br" | b"w:cr") {
                    out.push('\n');
                }
            }
            Ok(Event::Text(t)) if in_text => {
                // 0.41 split decoding (charset) from unescaping (entities).
                if let Ok(decoded) = t.decode() {
                    match quick_xml::escape::unescape(&decoded) {
                        Ok(unescaped) => out.push_str(&unescaped),
                        Err(_) => out.push_str(&decoded),
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => anyhow::bail!("OOXML parse error: {e}"),
            _ => {}
        }
        buf.clear();
    }
    Ok(())
}

fn is_text_tag(name: &[u8]) -> bool {
    matches!(name, b"w:t" | b"a:t" | b"t")
}

fn is_para_tag(name: &[u8]) -> bool {
    matches!(name, b"w:p" | b"a:p" | b"p")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ooxml_text_joins_runs_and_breaks_paragraphs() {
        let xml = r#"<w:document><w:body>
            <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>
            <w:p><w:r><w:t>Second</w:t></w:r></w:p>
        </w:body></w:document>"#;
        let mut out = String::new();
        extract_ooxml_text(xml, &mut out).unwrap();
        assert!(out.contains("Hello world"), "runs concatenated: {out:?}");
        assert!(out.contains("Second"), "second paragraph present: {out:?}");
        // Paragraph boundary produced a newline between the two.
        let h = out.find("Hello").unwrap();
        let s = out.find("Second").unwrap();
        assert!(out[h..s].contains('\n'), "paragraph break inserted");
    }

    #[test]
    fn slide_num_orders_numerically() {
        assert!(slide_num("ppt/slides/slide2.xml") < slide_num("ppt/slides/slide10.xml"));
        assert_eq!(slide_num("word/document.xml"), 0);
    }
}

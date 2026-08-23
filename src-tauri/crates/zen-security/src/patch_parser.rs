use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub enum PatchHunk {
    AddFile {
        path: PathBuf,
        content: String,
    },
    DeleteFile {
        path: PathBuf,
    },
    UpdateFile {
        path: PathBuf,
        search: String,
        replace: String,
    },
}

impl PatchHunk {
    pub fn path(&self) -> &std::path::Path {
        match self {
            PatchHunk::AddFile { path, .. } => path,
            PatchHunk::DeleteFile { path } => path,
            PatchHunk::UpdateFile { path, .. } => path,
        }
    }
}

#[derive(Debug, PartialEq)]
enum ParserState {
    Idle,
    AccumulatingAdd {
        path: PathBuf,
        lines: Vec<String>,
    },
    AccumulatingUpdateSearch {
        path: PathBuf,
        search_lines: Vec<String>,
    },
    AccumulatingUpdateReplace {
        path: PathBuf,
        search: String,
        replace_lines: Vec<String>,
    },
}

pub fn parse_patches(patch_str: &str) -> Result<Vec<PatchHunk>, String> {
    let mut hunks = Vec::new();
    let mut state = ParserState::Idle;
    let lines_iter = patch_str.lines().enumerate();

    for (line_num, raw_line) in lines_iter {
        let line = raw_line.trim_end();
        let display_line_num = line_num + 1;

        if line.starts_with("*** Add File: ") {
            // Flush current state
            flush_state(&mut hunks, &mut state)?;
            let path = line.strip_prefix("*** Add File: ").unwrap().trim();
            if path.is_empty() {
                return Err(format!("Empty file path in Add File marker at line {}", display_line_num));
            }
            state = ParserState::AccumulatingAdd {
                path: PathBuf::from(path),
                lines: Vec::new(),
            };
        } else if line.starts_with("*** Delete File: ") {
            // Flush current state
            flush_state(&mut hunks, &mut state)?;
            let path = line.strip_prefix("*** Delete File: ").unwrap().trim();
            if path.is_empty() {
                return Err(format!("Empty file path in Delete File marker at line {}", display_line_num));
            }
            hunks.push(PatchHunk::DeleteFile {
                path: PathBuf::from(path),
            });
        } else if line.starts_with("*** Update File: ") {
            // Flush current state
            flush_state(&mut hunks, &mut state)?;
            let path = line.strip_prefix("*** Update File: ").unwrap().trim();
            if path.is_empty() {
                return Err(format!("Empty file path in Update File marker at line {}", display_line_num));
            }
            state = ParserState::AccumulatingUpdateSearch {
                path: PathBuf::from(path),
                search_lines: Vec::new(),
            };
        } else {
            match &mut state {
                ParserState::Idle => {
                    // Ignore leading/trailing comments or text outside of markers
                }
                ParserState::AccumulatingAdd { lines, .. } => {
                    // LLM might prefix added lines with "+"
                    let cleaned_line = line.strip_prefix('+').unwrap_or(raw_line);
                    lines.push(cleaned_line.to_string());
                }
                ParserState::AccumulatingUpdateSearch { path, search_lines } => {
                    if line == "<<<<<<< SEARCH" {
                        // Mark start of search block
                        continue;
                    }
                    if line == "=======" {
                        let search = search_lines.join("\n");
                        state = ParserState::AccumulatingUpdateReplace {
                            path: path.clone(),
                            search,
                            replace_lines: Vec::new(),
                        };
                    } else {
                        search_lines.push(raw_line.to_string());
                    }
                }
                ParserState::AccumulatingUpdateReplace { path, search, replace_lines } => {
                    if line == ">>>>>>> REPLACE" {
                        let replace = replace_lines.join("\n");
                        hunks.push(PatchHunk::UpdateFile {
                            path: path.clone(),
                            search: search.clone(),
                            replace,
                        });
                        state = ParserState::Idle;
                    } else {
                        replace_lines.push(raw_line.to_string());
                    }
                }
            }
        }
    }

    flush_state(&mut hunks, &mut state)?;
    Ok(hunks)
}

fn flush_state(hunks: &mut Vec<PatchHunk>, state: &mut ParserState) -> Result<(), String> {
    match state {
        ParserState::AccumulatingAdd { path, lines } => {
            hunks.push(PatchHunk::AddFile {
                path: path.clone(),
                content: lines.join("\n"),
            });
        }
        ParserState::AccumulatingUpdateSearch { path, .. } => {
            return Err(format!(
                "Incomplete Update File block for path '{}': missing SEARCH block",
                path.display()
            ));
        }
        ParserState::AccumulatingUpdateReplace { path, .. } => {
            return Err(format!(
                "Incomplete Update File block for path '{}': missing REPLACE block marker (>>>>>>> REPLACE)",
                path.display()
            ));
        }
        ParserState::Idle => {}
    }
    *state = ParserState::Idle;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_patches_valid() {
        let patch = r#"*** Add File: src/main.rs
+fn main() {
+    println!("hello");
+}
*** Update File: src/lib.rs
<<<<<<< SEARCH
fn old() {
    // something
}
=======
fn new() {
    // updated
}
>>>>>>> REPLACE
*** Delete File: old_file.txt"#;

        let hunks = parse_patches(patch).unwrap();
        assert_eq!(hunks.len(), 3);

        assert_eq!(
            hunks[0],
            PatchHunk::AddFile {
                path: PathBuf::from("src/main.rs"),
                content: "fn main() {\n    println!(\"hello\");\n}".to_string(),
            }
        );

        assert_eq!(
            hunks[1],
            PatchHunk::UpdateFile {
                path: PathBuf::from("src/lib.rs"),
                search: "fn old() {\n    // something\n}".to_string(),
                replace: "fn new() {\n    // updated\n}".to_string(),
            }
        );

        assert_eq!(
            hunks[2],
            PatchHunk::DeleteFile {
                path: PathBuf::from("old_file.txt"),
            }
        );
    }
}

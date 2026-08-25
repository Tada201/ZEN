//! Structured handoff context for sub-agent spawning.
//!
//! Replaces raw parent message dumps with a typed task recipe so child agents
//! receive only the information they need to complete a delegated task.

use zen_db::models::ChatMessage;
use regex::Regex;
use std::sync::LazyLock;

const DEFAULT_SUCCESS_CRITERIA: &str = "Complete the delegated task and return a concise, well-structured summary of your findings or actions.";

// Compile-time literal exercised by the build_handoff_context tests; cannot
// fail at runtime.
#[allow(clippy::expect_used)]
static FILE_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?x)
        (?:
            [`'\"]?                                 # optional quote
            (?:[\w.-]+/)+[\w.-]+\.(?:rs|tsx|ts|jsx|js|json|md|toml|yaml|yml|css|html|py|go|sql)
            [`'\"]?
        )
        |
        (?:
            [`'\"]?
            (?:src|docs|test|resources|src-tauri)/[\w./-]+
            [`'\"]?
        )
        "#,
    )
    .expect("file path regex must compile")
});

/// Typed context passed to a child agent instead of raw parent messages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandoffContext {
    pub task: String,
    pub role: String,
    pub agent_instructions: String,
    pub relevant_files: Vec<String>,
    pub constraints: Vec<String>,
    pub success_criteria: String,
    pub parent_summary: Option<String>,
}

pub struct HandoffContextInput<'a> {
    pub agent_name: &'a str,
    pub agent_instructions: &'a str,
    pub task: &'a str,
    pub caller_context: &'a str,
    pub success_criteria: Option<&'a str>,
    pub constraints: &'a [String],
    pub relevant_files: &'a [String],
}

pub fn build_handoff_context(input: HandoffContextInput<'_>) -> HandoffContext {
    let mut files: Vec<String> = input.relevant_files.to_vec();
    for path in extract_file_paths(input.task) {
        push_unique(&mut files, path);
    }
    if !input.caller_context.is_empty() {
        for path in extract_file_paths(input.caller_context) {
            push_unique(&mut files, path);
        }
    }

    let parent_summary = if input.caller_context.trim().is_empty() {
        None
    } else {
        Some(input.caller_context.trim().to_string())
    };

    HandoffContext {
        task: input.task.to_string(),
        role: input.agent_name.to_string(),
        agent_instructions: input
            .agent_instructions
            .lines()
            .take(50)
            .collect::<Vec<_>>()
            .join("\n"),
        relevant_files: files,
        constraints: input.constraints.to_vec(),
        success_criteria: input
            .success_criteria
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| DEFAULT_SUCCESS_CRITERIA.to_string()),
        parent_summary,
    }
}

pub fn handoff_to_messages(handoff: &HandoffContext) -> Vec<ChatMessage> {
    vec![ChatMessage {
        role: "user".to_string(),
        content: render_handoff_prompt(handoff),
        reasoning_details: None,
        images: None,
        tool_calls: None,
        tool_call_id: None,
    }]
}

pub fn render_handoff_prompt(handoff: &HandoffContext) -> String {
    let mut prompt = String::from("## Task Delegation\n\n");

    prompt.push_str("### Your Role\n");
    prompt.push_str(&format!(
        "You are {}, a specialized AI agent.\n{}\n\n",
        handoff.role, handoff.agent_instructions
    ));

    if let Some(summary) = &handoff.parent_summary {
        prompt.push_str("### Parent Context (summary)\n");
        prompt.push_str(summary);
        prompt.push_str("\n\n");
    }

    if !handoff.relevant_files.is_empty() {
        prompt.push_str("### Relevant Files\n");
        for path in &handoff.relevant_files {
            prompt.push_str("- ");
            prompt.push_str(path);
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    if !handoff.constraints.is_empty() {
        prompt.push_str("### Constraints\n");
        for constraint in &handoff.constraints {
            prompt.push_str("- ");
            prompt.push_str(constraint);
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    prompt.push_str("### Task\n");
    prompt.push_str(&handoff.task);
    prompt.push_str("\n\n");

    prompt.push_str("### Success Criteria\n");
    prompt.push_str(&handoff.success_criteria);
    prompt.push_str("\n\n");

    prompt.push_str("### Instructions\n");
    prompt.push_str("1. Focus on completing this specific task efficiently\n");
    prompt.push_str("2. Use only the tools required for this task\n");
    prompt.push_str("3. Provide a comprehensive, well-structured result\n");
    prompt.push_str("4. Base your work on the task, success criteria, and constraints above\n");
    prompt.push_str("5. Do not spawn or delegate to other agents; complete this task directly\n");

    prompt
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn extract_file_paths(text: &str) -> Vec<String> {
    FILE_PATH_RE
        .find_iter(text)
        .map(|m| m.as_str().trim_matches(['`', '\'', '"']).to_string())
        .filter(|path| path.len() >= 4)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handoff_omits_parent_message_dump() {
        let handoff = build_handoff_context(HandoffContextInput {
            agent_name: "Researcher",
            agent_instructions: "Find facts.",
            task: "Summarize src-tauri/src/agent/tools/spawn_tools.rs",
            caller_context: "User asked about subagent spawning.",
            success_criteria: None,
            constraints: &[],
            relevant_files: &[],
        });

        let messages = handoff_to_messages(&handoff);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, "user");
        assert!(messages[0].content.contains("### Task\nSummarize"));
        assert!(messages[0].content.contains("Parent Context (summary)"));
        assert!(messages[0]
            .content
            .contains("src-tauri/src/agent/tools/spawn_tools.rs"));
    }

    #[test]
    fn handoff_always_blocks_delegation() {
        let handoff = build_handoff_context(HandoffContextInput {
            agent_name: "Worker",
            agent_instructions: "Work.",
            task: "Do thing",
            caller_context: "",
            success_criteria: None,
            constraints: &[],
            relevant_files: &[],
        });

        let prompt = render_handoff_prompt(&handoff);
        assert!(prompt.contains("Do not spawn or delegate"));
    }

    #[test]
    fn extract_file_paths_finds_common_paths() {
        let paths = extract_file_paths("Edit src/atlas/components/ChatSection.tsx and docs/architecture/frontend-rules.md");
        assert!(paths.contains(&"src/atlas/components/ChatSection.tsx".to_string()));
        assert!(paths.contains(&"docs/architecture/frontend-rules.md".to_string()));
    }
}

//! Parallel spawn batches: the dependency graph that orders agent waves and
//! the `{{agent_id}}` placeholder substitution that feeds one agent's result
//! into a dependent agent's task.

use anyhow::Result;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};

/// A single agent request inside a parallel spawn batch, with optional
/// dependency declarations.
#[derive(Debug, Clone)]
pub(super) struct AgentRequest {
    /// Optional user-supplied identifier. If omitted, a synthetic id is
    /// generated from the array index.
    pub(super) id: String,
    /// IDs of other agents in the same batch that must complete first.
    pub(super) depends_on: Vec<String>,
    /// The raw JSON request as received from the tool call.
    pub(super) request: Value,
}

/// Parsed and validated dependency graph for a parallel spawn batch.
#[derive(Debug)]
pub(super) struct DependencyGraph {
    pub(super) nodes: Vec<AgentRequest>,
    /// Execution waves: each inner vector holds indices of agents whose
    /// dependencies are all satisfied at that wave.
    pub(super) waves: Vec<Vec<usize>>,
}

impl DependencyGraph {
    pub(super) fn new(nodes: Vec<AgentRequest>) -> Result<Self> {
        let index_by_id: HashMap<String, usize> = nodes
            .iter()
            .enumerate()
            .map(|(idx, node)| (node.id.clone(), idx))
            .collect();

        // Validate that every id is unique.
        if index_by_id.len() != nodes.len() {
            return Err(anyhow::anyhow!(
                "Duplicate agent ids in parallel spawn batch"
            ));
        }

        // Validate that every dependency refers to an existing node.
        for node in &nodes {
            for dep in &node.depends_on {
                if !index_by_id.contains_key(dep) {
                    return Err(anyhow::anyhow!(
                        "Agent '{}' depends on unknown agent '{}'",
                        node.id, dep
                    ));
                }
            }
        }

        // Detect cycles using Kahn's algorithm.
        let mut in_degree = vec![0usize; nodes.len()];
        let mut adjacency: Vec<Vec<usize>> = vec![vec![]; nodes.len()];
        for (idx, node) in nodes.iter().enumerate() {
            for dep in &node.depends_on {
                let dep_idx = index_by_id[dep];
                adjacency[dep_idx].push(idx);
                in_degree[idx] += 1;
            }
        }

        let mut queue: VecDeque<usize> = in_degree
            .iter()
            .enumerate()
            .filter(|(_, d)| **d == 0)
            .map(|(idx, _)| idx)
            .collect();
        let mut topo_order = Vec::new();
        while let Some(idx) = queue.pop_front() {
            topo_order.push(idx);
            for next in &adjacency[idx] {
                in_degree[*next] -= 1;
                if in_degree[*next] == 0 {
                    queue.push_back(*next);
                }
            }
        }

        if topo_order.len() != nodes.len() {
            return Err(anyhow::anyhow!(
                "Circular dependency detected in parallel spawn agents"
            ));
        }

        // Build waves: group agents by the longest dependency chain length.
        let mut wave_by_idx = vec![0usize; nodes.len()];
        for idx in topo_order {
            let max_dep_wave = nodes[idx]
                .depends_on
                .iter()
                .map(|dep| wave_by_idx[index_by_id[dep]])
                .max()
                .unwrap_or(0);
            wave_by_idx[idx] = max_dep_wave + 1;
        }

        let wave_count = wave_by_idx.iter().max().copied().unwrap_or(0);
        let mut waves: Vec<Vec<usize>> = vec![vec![]; wave_count];
        for (idx, wave) in wave_by_idx.into_iter().enumerate() {
            if wave > 0 {
                waves[wave - 1].push(idx);
            }
        }

        Ok(Self {
            nodes,
            waves,
        })
    }
}

/// Compiled regex for dependency placeholders of the form `{{agent_id}}`,
/// `{{results.agent_id}}`, `{{agent_id.full_content}}`, or
/// `{{results.agent_id.result}}`.
fn dependency_placeholder_regex() -> &'static regex::Regex {
    use std::sync::OnceLock;
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"\{\{\s*([a-zA-Z0-9_\-]+)(?:\.([a-zA-Z0-9_\-]+))?(?:\.([a-zA-Z0-9_\-]+))?\s*\}\}")
            .unwrap_or_else(|e| panic!("dependency placeholder regex failed to compile: {e}"))
    })
}

/// Resolve a dependency placeholder into an agent id and a field selector.
/// Supports `{{id}}`, `{{results.id}}`, `{{id.field}}`, and
/// `{{results.id.field}}`. The default field is `summary`.
fn parse_dependency_placeholder<'a>(caps: &'a regex::Captures<'a>) -> (&'a str, &'a str) {
    let first = caps.get(1).map(|m| m.as_str()).unwrap_or("");
    let second = caps.get(2).map(|m| m.as_str());
    let third = caps.get(3).map(|m| m.as_str());

    if first == "results" {
        // {{results.id}} or {{results.id.field}}
        let id = second.unwrap_or("");
        let field = third.unwrap_or("summary");
        (id, field)
    } else {
        // {{id}} or {{id.field}}
        let id = first;
        let field = second.unwrap_or("summary");
        (id, field)
    }
}

/// Substitute placeholders of the form `{{agent_id}}` or `{{results.agent_id}}`
/// inside a task/context string with the referenced agent's result.
/// Supported fields: `summary` (default), `full_content`, `result` (full JSON).
pub(super) fn substitute_dependency_placeholders(template: &str, results: &HashMap<String, Value>) -> String {
    let re = dependency_placeholder_regex();
    re.replace_all(template, |caps: &regex::Captures<'_>| {
        let (id, field) = parse_dependency_placeholder(caps);
        match results.get(id) {
            Some(result) => match field {
                "summary" => result
                    .get("summary")
                    .and_then(Value::as_str)
                    .or_else(|| result.get("result").and_then(|r| r.get("summary")).and_then(Value::as_str))
                    .unwrap_or("")
                    .to_string(),
                "full_content" => result
                    .get("full_content")
                    .and_then(Value::as_str)
                    .or_else(|| result.get("result").and_then(|r| r.get("full_content")).and_then(Value::as_str))
                    .unwrap_or("")
                    .to_string(),
                "result" => result.to_string(),
                _ => result
                    .get("summary")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            },
            None => format!("{{{{{id}.{field}}}}}"),
        }
    })
    .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_agent_request(id: &str, depends_on: &[&str]) -> AgentRequest {
        AgentRequest {
            id: id.to_string(),
            depends_on: depends_on.iter().map(|s| s.to_string()).collect(),
            request: json!({"task": "test"}),
        }
    }

    #[test]
    fn dependency_graph_no_dependencies_single_wave() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &[]),
            make_agent_request("c", &[]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 1);
        assert_eq!(graph.waves[0].len(), 3);
    }

    #[test]
    fn dependency_graph_linear_chain_waves() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["b"]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 3);
        assert!(graph.waves[0].contains(&0));
        assert!(graph.waves[1].contains(&1));
        assert!(graph.waves[2].contains(&2));
    }

    #[test]
    fn dependency_graph_diamond_shape() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["a"]),
            make_agent_request("d", &["b", "c"]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 3);
        assert!(graph.waves[0].contains(&0));
        assert!(graph.waves[1].contains(&1));
        assert!(graph.waves[1].contains(&2));
        assert!(graph.waves[2].contains(&3));
    }

    #[test]
    fn dependency_graph_detects_cycle() {
        let nodes = vec![
            make_agent_request("a", &["c"]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["b"]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("Circular dependency"));
    }

    #[test]
    fn dependency_graph_detects_missing_dependency() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["z"]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("unknown agent"));
    }

    #[test]
    fn dependency_graph_detects_duplicate_ids() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("a", &[]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("Duplicate"));
    }

    #[test]
    fn substitute_dependency_placeholders_default_summary() {
        let mut results = HashMap::new();
        results.insert(
            "agent_1".to_string(),
            json!({"summary": "the summary", "full_content": "the full content"}),
        );
        assert_eq!(
            substitute_dependency_placeholders("{{agent_1}}", &results),
            "the summary"
        );
        assert_eq!(
            substitute_dependency_placeholders("{{results.agent_1}}", &results),
            "the summary"
        );
    }

    #[test]
    fn substitute_dependency_placeholders_full_content() {
        let mut results = HashMap::new();
        results.insert(
            "agent_1".to_string(),
            json!({"summary": "the summary", "full_content": "the full content"}),
        );
        assert_eq!(
            substitute_dependency_placeholders("{{agent_1.full_content}}", &results),
            "the full content"
        );
        assert_eq!(
            substitute_dependency_placeholders("{{results.agent_1.full_content}}", &results),
            "the full content"
        );
    }

    #[test]
    fn substitute_dependency_placeholders_unknown_id_preserved() {
        let results = HashMap::new();
        assert_eq!(
            substitute_dependency_placeholders("{{missing.summary}}", &results),
            "{{missing.summary}}"
        );
    }
}

import re

with open('src-tauri/src/agent/runner.rs', 'r', encoding='utf-8') as f:
    content = f.read()

changes = []

# 1. Update execute_tools_with_hooks signature to add authorized_tool_ids parameter
old_sig = (
    '        agent_name: &str,\n'
    '        token: CancellationToken,\n'
    '    ) -> Vec<ToolResult> {\n'
    '        let mut handles = Vec::new();\n'
)

new_sig = (
    '        agent_name: &str,\n'
    '        authorized_tool_ids: &[String],\n'
    '        token: CancellationToken,\n'
    '    ) -> Vec<ToolResult> {\n'
    '        // Preprocess tool calls for meta-tool dispatch\n'
    '        // Meta-tools (tool_list, tool_info) are handled inline.\n'
    '        // tool_exec is transformed to use the real tool name and arguments.\n'
    '        let processed_calls: Vec<(ToolCall, Option<ToolResult>)> = tool_calls.iter().map(|tc| {\n'
    '            match tc.name.as_str() {\n'
    '                "tool_list" => {\n'
    '                    let descriptors = self.tool_manager.list_allowed(authorized_tool_ids);\n'
    '                    let result = ToolResult {\n'
    '                        tool_call_id: tc.id.clone(),\n'
    '                        content: serde_json::to_value(&descriptors).unwrap_or_default(),\n'
    '                        is_error: false,\n'
    '                    };\n'
    '                    (tc.clone(), Some(result))\n'
    '                }\n'
    '                "tool_info" => {\n'
    '                    let tool_id = tc.args.get("tool_id")\n'
    '                        .and_then(|v| v.as_str())\n'
    '                        .unwrap_or("");\n'
    '                    let schema = self.tool_manager.get_info(tool_id);\n'
    '                    let result = match schema {\n'
    '                        Some(s) => ToolResult {\n'
    '                            tool_call_id: tc.id.clone(),\n'
    '                            content: serde_json::to_value(&s).unwrap_or_default(),\n'
    '                            is_error: false,\n'
    '                        },\n'
    '                        None => ToolResult {\n'
    '                            tool_call_id: tc.id.clone(),\n'
    '                            content: serde_json::json!({\n'
    '                                "error": format!("Tool \\\'{} \\\' not found. Use tool_list to see available tools.", tool_id),\n'
    '                                "hint": "Check the tool_id spelling or call tool_list first to see all available tools."\n'
    '                            }),\n'
    '                            is_error: true,\n'
    '                        },\n'
    '                    };\n'
    '                    (tc.clone(), Some(result))\n'
    '                }\n'
    '                "tool_exec" => {\n'
    '                    // Transform tool_exec into the real tool call\n'
    '                    if let Some((real_id, real_args)) = self.tool_manager.resolve_tool_exec(&tc.args) {\n'
    '                        let real_tc = ToolCall {\n'
    '                            id: tc.id.clone(),\n'
    '                            name: real_id,\n'
    '                            args: real_args,\n'
    '                        };\n'
    '                        (real_tc, None)\n'
    '                    } else {\n'
    '                        let result = ToolResult {\n'
    '                            tool_call_id: tc.id.clone(),\n'
    '                            content: serde_json::json!({\n'
    '                                "error": "Tool not found or invalid arguments. Use tool_list and tool_info to discover valid tools.",\n'
    '                                "hint": "Call tool_list() to see available tools, then tool_info({\\"tool_id\\": \\"name\\"}) for the schema."\n'
    '                            }),\n'
    '                            is_error: true,\n'
    '                        };\n'
    '                        (tc.clone(), Some(result))\n'
    '                    }\n'
    '                }\n'
    '                _ => {\n'
    '                    // Normal tool call — pass through unchanged\n'
    '                    (tc.clone(), None)\n'
    '                }\n'
    '            }\n'
    '        }).collect();\n'
    '\n'
    '        // Separate inline results from calls that need the full pipeline\n'
    '        let mut results: Vec<ToolResult> = Vec::new();\n'
    '        let mut pipeline_calls: Vec<ToolCall> = Vec::new();\n'
    '        for (tc, inline_result) in processed_calls {\n'
    '            match inline_result {\n'
    '                Some(r) => results.push(r),\n'
    '                None => pipeline_calls.push(tc),\n'
    '            }\n'
    '        }\n'
    '\n'
    '        // Process pipeline calls (non-meta-tools and transformed tool_exec)\n'
    '        let mut handles = Vec::new();\n'
)

if old_sig in content:
    content = content.replace(old_sig, new_sig, 1)
    changes.append("Updated execute_tools_with_hooks with meta-tool dispatch")
    print("OK: Updated execute_tools_with_hooks signature and dispatch")
else:
    print("FAIL: execute_tools_with_hooks signature")
    # Debug: find the actual text
    idx = content.find('agent_name: &str,')
    if idx >= 0:
        chunk = content[idx:idx+120]
        print(f"Found around agent_name: {repr(chunk)}")
    else:
        print("Could not find agent_name line")

# 2. Update the return value — change from collecting handles directly
# to combining inline results + pipeline results
# The current return is: results (at end of function)
# We need to change the end to combine both

# Find where results are returned at the end of the function
old_return = (
    '        let mut results = Vec::new();\n'
    '        for (tc_id, handle) in handles {\n'
    '            match handle.await {\n'
    '                Ok(result) => results.push(result),\n'
    '                Err(e) => {\n'
    '                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);\n'
    '                    results.push(ToolResult {\n'
    '                        tool_call_id: tc_id,\n'
    '                        content: json!({ \n'
    '                            "error": format!("Internal execution panic: {}", e),\n'
    '                            "hint": "The tool thread crashed unexpectedly. Please report this if it persists."\n'
    '                        }),\n'
    '                        is_error: true,\n'
    '                    })\n'
    '                }\n'
    '            }\n'
    '        }\n'
    '        results\n'
)

# But the old_return would have `results` at the end as the variable name,
# and we already have a local `results` variable. Let me instead just 
# update the final line from `results` to include both.

# Actually, looking at the code flow more carefully:
# The function now has:
#   let mut results = Vec::new(); (for inline meta-tool results)
#   let mut pipeline_calls = ... (for tools needing pipeline)
#   let mut handles = Vec::new(); (for pipeline tasks)
#   ... (pipeline processing loop uses `handles` variable)
#   ... at the end: `results` is returned
# But the pipeline loop creates a NEW `let mut results = Vec::new()` later!
# I need to redirect that to push into a shared results vec.

# Let me check what the current function end looks like
idx_end = content.rfind('        let mut results = Vec::new();')
if idx_end >= 0:
    end_chunk = content[idx_end:idx_end+400]
    print(f"End of function: {repr(end_chunk[:200])}")

# Actually, the simpler approach: instead of the complex restructuring above,
# let me just update the final return to combine both inline + pipeline results.
# The pipeline loop creates its own `let mut results`, then returns `results`.
# I need to merge that into our outer `results`.

# Let me find the exact return pattern
old_ret = (
    '        let mut results = Vec::new();\n'
    '        for (tc_id, handle) in handles'
)

if old_sig not in content and old_ret in content:
    # The old_return exists => the replacement of the signature failed
    # This means the function body was NOT modified
    print("Signature replacement failed - need alternate approach")
    
    # Try to find the actual signature by searching for key parts
    for pattern in ['fn execute_tools_with_hooks', 'execute_tools_with_hooks']:
        idx = content.find(pattern)
        if idx >= 0:
            print(f"Found '{pattern}' at position {idx}")
            print(repr(content[idx:idx+300]))
            break

with open('src-tauri/src/agent/runner.rs', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n=== Applied {len(changes)} changes ===")
for c in changes:
    print(f"  - {c}")

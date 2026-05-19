import re

with open('src-tauri/src/agent/runner.rs', 'r', encoding='utf-8') as f:
    content = f.read()

changes = []

# Replace the authorized_tools code block (match code only, not the special char comments)
old_code = (
    '            let authorized_tools: Vec<_> = if self.config.tools_enabled {\n'
    '                self.tool_registry.read().await.list()\n'
    '                    .into_iter()\n'
    '                    .filter(|t| current_agent.tool_ids.contains(&t.id().to_string()))\n'
    '                    .map(|t| crate::tools::ToolInfo {\n'
    '                        name: t.id().to_string(),\n'
    '                        description: t.description().to_string(),\n'
    '                        parameters: t.input_schema(),\n'
    '                    })\n'
    '                    .collect()\n'
    '            } else {\n'
    '                Vec::new()\n'
    '            };\n'
)

new_code = (
    '            // With the meta-tool pattern, we inject only 3 meta-tools (tool_list,\n'
    '            // tool_info, tool_exec) instead of all individual tool schemas.\n'
    '            // The LLM discovers tools dynamically via tool_list / tool_info.\n'
    '            let authorized_tool_ids: Vec<String> = if self.config.tools_enabled {\n'
    '                self.tool_registry.read().await.list()\n'
    '                    .into_iter()\n'
    '                    .filter(|t| current_agent.tool_ids.contains(&t.id().to_string()))\n'
    '                    .map(|t| t.id().to_string())\n'
    '                    .collect()\n'
    '            } else {\n'
    '                Vec::new()\n'
    '            };\n'
    '\n'
    '            let meta_tools: Vec<crate::tools::ToolInfo> = if self.config.tools_enabled {\n'
    '                crate::tools::manager::meta_tool_definitions()\n'
    '            } else {\n'
    '                Vec::new()\n'
    '            };\n'
)

if old_code in content:
    content = content.replace(old_code, new_code, 1)
    changes.append("Replaced authorized_tools with meta-tools")
    print("OK: Replaced authorized_tools block")
else:
    print("FAIL: authorized_tools block - trying alternate approach")
    # Try using regex to find and replace
    pattern = r'let authorized_tools: Vec<_> = if self\.config\.tools_enabled \{[^}]+self\.tool_registry\.read\(\)\.await\.list\(\)[^;]+;\n'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(f"  Found match at position {match.start()}: {match.group()[:80]}...")
    else:
        print("  Regex also failed")

with open('src-tauri/src/agent/runner.rs', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n=== Applied {len(changes)} changes ===")
for c in changes:
    print(f"  - {c}")

import re

with open('src-tauri/src/agent/runner.rs', 'r', encoding='utf-8') as f:
    content = f.read()

old = '        let mut results = Vec::new();\n        for (tc_id, handle) in handles {\n            match handle.await {\n                Ok(result) => results.push(result),\n                Err(e) => {\n                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);\n                    results.push(ToolResult {\n                        tool_call_id: tc_id,'

new = '        // Collect pipeline results into the existing results vec (which already has inline meta-tool results)\n        for (tc_id, handle) in handles {\n            match handle.await {\n                Ok(result) => results.push(result),\n                Err(e) => {\n                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);\n                    results.push(ToolResult {\n                        tool_call_id: tc_id,'

if old in content:
    content = content.replace(old, new, 1)
    print("OK: Fixed duplicate results declaration")
else:
    print("FAIL: Could not find the text")
    # Try to find similar text
    idx = content.find('let mut results = Vec::new()')
    if idx >= 0:
        chunk = content[idx:idx+250]
        print(f"Found at {idx}: {repr(chunk)}")
    else:
        print("No 'let mut results = Vec::new()' found anywhere")

with open('src-tauri/src/agent/runner.rs', 'w', encoding='utf-8') as f:
    f.write(content)

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[003-streaming-architecture-redesign/plan.md](specs/003-streaming-architecture-redesign/plan.md)

## Codegraph Navigation
- Use the codegraph located in `graphify-out/` to explore code relationships, community hubs, and god nodes.
- Query and analyze the SQLite AST database located at `.codegraph/codegraph.db` (which tracks all code symbols, enums, structs, traits, calls, and imports) to perform high-precision code exploration and dependency resolution.
- When performing research or planning, utilize the codegraphs as primary resources to understand architectural connections and dependencies.
- You can query nodes, edges, and communities to identify core components and surprising connections before modifying or architecting new features.
<!-- SPECKIT END -->

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured through `.mcp.json`. CodeGraph is a tree-sitter parsed knowledge graph of symbols, edges, and files stored in `.codegraph/codegraph.db`.

### When To Prefer CodeGraph

Use CodeGraph for structural questions: what calls what, what would break, where a symbol is defined, signatures, ownership, architecture, and impact. Use native grep/read only for literal text searches or after CodeGraph has identified a specific file that must be inspected.

| Question | Tool |
|---|---|
| Where is X defined? | `codegraph_search` |
| What calls function Y? | `codegraph_callers` |
| What does Y call? | `codegraph_callees` |
| What would break if I changed Z? | `codegraph_impact` |
| Show Y's signature/source/docstring | `codegraph_node` |
| Give focused context for a task/area | `codegraph_context` |
| See several related symbols' source | `codegraph_explore` |
| What files exist under path/? | `codegraph_files` |
| Is the index healthy? | `codegraph_status` |

### Rules Of Thumb

- Answer directly; do not delegate exploration to a file-reading sub-agent. For "how does X work" or architecture questions, call `codegraph_context` first, then at most one focused `codegraph_explore` for the symbols it surfaces.
- Trust CodeGraph for structural results. Do not re-verify symbol relationships with grep unless the index reports staleness or the question is a literal text search.
- Do not grep first when looking up a symbol by name. Use `codegraph_search`.
- Do not chain repeated `codegraph_node` calls over many symbols. Use one `codegraph_explore` call with the relevant symbol/file names.
- Check `codegraph_status` when results look stale. If a response reports pending sync/staleness for specific files, read only those files directly.

### If `.codegraph/` Does Not Exist

Ask the user before initializing: "This project does not have CodeGraph initialized. Do you want me to run `codegraph init -i`?"
<!-- CODEGRAPH_END -->

## Agent Rules
0. **Read RULES.md First**: Before planning or editing, read [RULES.md](RULES.md). It is the current architecture contract and phase rebuild guide for this codebase.
1. **Function over Form**: Prioritize utility and performance. Every unique animation or UI feature must serve a clear purpose and be useful. Avoid performance waste on purely decorative elements.
2. **Utilize .codegraph Rules**: Always consult `.agents/rules/codegraph.md` when querying the SQLite codegraph database to inspect schemas and find optimal SQL query templates.
3. **Concise Claude-style Responses**: Always consult and follow the guidelines in `.agents/rules/agents_response.md` to keep communication concise, direct, tool-first, and minimally verbose during task execution.

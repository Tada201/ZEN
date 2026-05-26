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

## Agent Rules
0. **Read RULES.md First**: Before planning or editing, read [RULES.md](RULES.md). It is the current architecture contract and phase rebuild guide for this codebase.
1. **Function over Form**: Prioritize utility and performance. Every unique animation or UI feature must serve a clear purpose and be useful. Avoid performance waste on purely decorative elements.
2. **Utilize .codegraph Rules**: Always consult `.agents/rules/codegraph.md` when querying the SQLite codegraph database to inspect schemas and find optimal SQL query templates.
3. **Concise Claude-style Responses**: Always consult and follow the guidelines in `.agents/rules/agents_response.md` to keep communication concise, direct, tool-first, and minimally verbose during task execution.

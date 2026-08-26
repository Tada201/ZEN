# Architecture Docs

Start here:

1. Read `RULES.md` at the repository root — including its "Workspace Crate Map",
   which names the owning crate for each backend area.
2. Read `docs/architecture/PHASED_REBUILD.md`.
3. Use the codegraph before planning cross-module changes.
4. For architecture calibration, read
   `docs/architecture/example-codebase-lessons.md`.
5. For backend test expectations, read
   `docs/architecture/backend-test-gate.md`.
6. For CI/CD and release artifact rules, read
   `docs/architecture/ci-cd.md`.
7. For backend tool ownership and migration rules, read
   `docs/architecture/tool-system.md`.
8. For privileged backend operation ownership, read
   `docs/architecture/privileged-operations.md`.
9. For frontend product, security, performance, and state rules, read
   `docs/architecture/frontend-rules.md`.
10. For the chat execution timeline persistence flow, read
   `docs/architecture/execution-timeline-persistence.md`.
11. For MCP protocol modernization and agent server discovery, read
   `docs/architecture/mcp-phase-plan.md`.

`history/` holds retired planning documents, kept as a record of how the current
structure came about. Do not use them for current planning.

This directory should hold architecture decisions, not loose notes. If a new
pattern is introduced, document the owner, the allowed path, and what not to do.

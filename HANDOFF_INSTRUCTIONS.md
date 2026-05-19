# Task Handoff Instructions

1. **Review HANDOFF.md**: This is the source of truth for the current state of the Zen Workbench.
2. **Check tasks.md**: Locate the roadmap in `specs/001-integrated-workbench/tasks.md` to see the remaining checklist.
3. **Verify Stores**: Always use the unified store export from `@/atlas/lib/store` to maintain state consistency.
4. **IPC Stability**: Ensure any new backend commands follow the pattern established in `src/atlas/hooks/useChat.ts` to avoid circular serialization errors.
5. **Aesthetics**: Maintain the HSL-based glassmorphism design system defined in `src/styles/index.css`.

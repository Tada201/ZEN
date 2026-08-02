# Chat Inline Agentic UX Refinement Checklist

This checklist is the acceptance contract for the premium, conversation-native
execution surface. Every execution type should use the same lifecycle shell and
only specialize the content preview.

## Execution lifecycle

- [ ] Planning, working, approval, verifying, and complete states share one typed status model.
- [x] Human-attention states (approval and error) remain visible above background activity.
- [x] Parallel groups show elapsed wall time, not the sum of child durations.
- [x] Completed low-value execution groups stay quiet after the assistant answer.
- [x] Reload reproduces the same group identity and terminal state.

## Content surfaces

- [x] File edits show grouped file counts, additions/deletions, preview, open, and full-diff actions.
- [x] Shell output shows a concise result summary with raw output behind disclosure.
- [x] Search and MCP results use structured previews with source/server context.
- [x] Image-generation results provide preview, retry, and technical details states.
- [ ] GenUI cards share the execution shell, loading/error/retry behavior, and motion rules.
- [x] Subagents show objective, progress, child work, and final result without internal IDs.

## Approval and failure

- [x] Approval cards explain the action, target, risk, and available decisions in plain language.
- [x] Approve/Deny controls are keyboard reachable and retain focus visibility.
- [x] Errors expose a useful summary and retry action without dumping raw internals.
- [x] Technical details are redacted and explicitly labeled as diagnostic.

## Motion and accessibility

- [ ] New rows enter in 160–220ms; disclosure transitions stay around 180–220ms.
- [ ] Running indicators are subtle and stop when work completes.
- [ ] Reduced-motion users receive equivalent state changes without looping animation.
- [ ] Status is communicated by text/icon/structure, not color alone.
- [ ] All disclosure and action controls have usable labels and focus states.

## Verification

- [ ] File edit → test → final answer flow.
- [ ] Search → citations → GenUI flow.
- [ ] MCP approval → result flow.
- [ ] Subagent → child tools → result flow.
- [ ] Parallel running + approval + error flow.
- [ ] Reload during execution and after completion.
- [ ] Stream interruption/reconnect flow.

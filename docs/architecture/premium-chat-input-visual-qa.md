# Premium Chat Input — Phase 7 Visual QA Matrix

**Surface:** `PremiumChatInput` and composer-owned popovers
**Fixture:** `?zen-harness=premium-chat-input`
**Owner:** Frontend/chat surface
**Status:** Phase 7 release gate

This matrix is the review contract for the production composer. The fixture mounts
production `PremiumChatInput` with local deterministic data; it does not submit
to a provider or change persisted preferences. Automated verifiers cover source
contracts and behavior. The visual checks below still require a browser review.

## Width and theme matrix

Review every row with the browser viewport wide enough to show the complete
container. Inspect the shell, editor, action rail, fixed actions, and any open
popover at the exact container width.

| Container | Theme | Baseline state | Acceptance criteria |
|---:|---|---|---|
| 320px | dark | typed draft | No horizontal overflow; labels collapse; submit remains visible; draft stays focused. |
| 390px | light | long multiline | Textarea remains bounded and scrolls internally; attachment/action rails do not wrap into an accidental second toolbar. |
| 480px | dark | breakpoint draft | Compact mode settles without a one-frame width jump or disappearing model identity. |
| 768px | light | normal draft | Full controls remain readable; action rail can shrink independently from context and submit actions. |
| 1024px | dark | desktop draft | Model, permission, pinned actions, voice, and submit controls retain one visual hierarchy. |
| 1440px | light | wide draft | Composer uses available width without stretching controls or creating excessive empty toolbar space. |

## Required state review

- Empty, typed, and long multiline drafts.
- Welcome and sidebar placement.
- Loading, paused, and read-only states.
- Attachment chip and image-preset rails.
- Task-plan disclosure open and closed.
- Add-content dialog open with unsupported actions absent.
- Model picker open, filtered, selected, and no-results states.
- Slash-command listbox with active option.
- Thinking configuration for effort, budget, and native/no-parameter models.
- Permission mode menu and confirmation/rollback path.

## Interaction acceptance criteria

### Keyboard and focus

- Enter sends once; Shift+Enter inserts a newline; IME composition does not send
  prematurely.
- Arrow/Home/End navigation works in add-content, model, and slash-command paths.
- Escape closes the active popup; focus return goes to its trigger (or the textarea
  for slash suggestions).
- Resize from 320px through 1440px preserves draft text and the focused element.
- No nested interactive controls appear in the pinned-action or menu surfaces.

### Geometry and motion

- The scrubber remains an overlay and never becomes a width-consuming sibling.
- Textarea growth is instant and capped; the transcript does not jump when the
  composer height changes.
- Popovers remain within the available composer width and are not clipped by the
  action rail.
- Streaming text does not animate token-by-token.
- With `html[data-motion="off"]` or reduced motion enabled, popup/disclosure motion
  becomes instant while labels, focus rings, and state changes remain understandable.

### Theme and contrast

- Both light and dark rows use semantic composer surfaces, not hardcoded dark
  backgrounds.
- Meaningful text, borders, selected states, and focus rings remain distinguishable
  in both themes.
- Disabled controls remain identifiable without relying on color alone.
- Provider icons remain decorative and do not create duplicate accessible names.

## Evidence to record

For each failed row, record:

1. fixture case and exact container width,
2. theme and browser zoom,
3. state or interaction sequence,
4. expected versus observed geometry/behavior,
5. screenshot or accessibility-tree evidence,
6. whether the issue is a blocker, high, medium, or polish item.

## Phase 7 rollout checklist

- [ ] Run `npm run test:premium-chat-input-system`.
- [ ] Run `npx tsc --noEmit` and `npm run build`.
- [ ] Review all six width/theme rows in the development fixture.
- [ ] Complete keyboard-only and reduced-motion passes.
- [ ] Confirm no production-only test prompts or duplicate task systems remain.
- [ ] Record blockers before enabling any further composer redesign work.

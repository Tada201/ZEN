# Architecture Exemptions

Exemptions are temporary. They exist so the rebuild can be incremental without
pretending current debt is acceptable.

## Required Format

```txt
File:
Owner:
Rule Exempted:
Reason:
Split or Fix Plan:
Expires:
```

## Current Exemptions To Triage

These files are known architecture hotspots and need owners before the hard file
size gate is enabled:

```txt
src/components/workbench/CesiumMapRenderer.tsx
src/atlas/sections/MediaSection.tsx
src-tauri/src/agent/runner/loop.rs
src-tauri/src/canvas/session.rs
src-tauri/src/agent/tools/progressive.rs
src-tauri/src/agent/workflow.rs
src-tauri/src/agent/swarm.rs
src/atlas/components/chat/AssistantMessage.tsx
src-tauri/src/agent/runner/tool_dispatch.rs
src/atlas/components/chat/SessionSidebar.tsx
src/atlas/components/voice/VoiceModeOverlay.tsx
src/atlas/sections/CombosSection.tsx
src/atlas/sections/DataDisplaySection.tsx
src/atlas/sections/InputsSection.tsx
src/atlas/sections/Lab3DSection.tsx
src/components/settings/Tabs/ProvidersSettings.tsx
src/components/ui/sidebar.tsx
src/components/widgets/workbench/InteractiveDrawingCanvas.tsx
src/components/Zen/XTermPanel.tsx
```

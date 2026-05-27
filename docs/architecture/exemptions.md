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

## Backend Exemptions

```txt
None active. Backend hard-limit files must fail the quality gate instead of
being exempted.
```

## Frontend Exemptions

```txt
File: src/components/workbench/CesiumMapRenderer.tsx
Owner: frontend/map
Rule Exempted: TS/TSX hard file-size limit
Reason: Map rendering, layers, entity conversion, and interactions are colocated.
Split or Fix Plan: Split renderer setup, layers, entity adapters, and interactions.
Expires: Phase 4/5

File: src/atlas/sections/MediaSection.tsx
Owner: frontend/atlas
Rule Exempted: TS/TSX hard file-size limit
Reason: Atlas demo content is dense and not yet production-structured.
Split or Fix Plan: Split media demos by component category.
Expires: Phase 4/5

File: src/atlas/components/chat/AssistantMessage.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Message rendering still owns markdown, tool display, reasoning, and artifact handling.
Split or Fix Plan: Extract message parts and rendering adapters.
Expires: Phase 4/5

File: src/atlas/components/chat/SessionSidebar.tsx
Owner: frontend/chat
Rule Exempted: TS/TSX hard file-size limit
Reason: Session navigation, filtering, folder UI, and actions are colocated.
Split or Fix Plan: Split search/filter, folder tree, row item, and actions menu.
Expires: Phase 4/5

File: src/atlas/components/voice/VoiceModeOverlay.tsx
Owner: frontend/voice
Rule Exempted: TS/TSX hard file-size limit
Reason: Voice UX, visualization, state display, and controls are colocated.
Split or Fix Plan: Split visualizer, controls, status panels, and interaction state.
Expires: Phase 4/5

File: src/atlas/sections/CombosSection.tsx
Owner: frontend/atlas
Rule Exempted: TS/TSX hard file-size limit
Reason: Atlas combo demos are grouped in one section file.
Split or Fix Plan: Split examples into focused components.
Expires: Phase 4/5

File: src/atlas/sections/DataDisplaySection.tsx
Owner: frontend/atlas
Rule Exempted: TS/TSX hard file-size limit
Reason: Atlas display demos are grouped in one section file.
Split or Fix Plan: Split examples into focused components.
Expires: Phase 4/5

File: src/atlas/sections/InputsSection.tsx
Owner: frontend/atlas
Rule Exempted: TS/TSX hard file-size limit
Reason: Atlas input demos are grouped in one section file.
Split or Fix Plan: Split examples into focused components.
Expires: Phase 4/5

File: src/atlas/sections/Lab3DSection.tsx
Owner: frontend/atlas
Rule Exempted: TS/TSX hard file-size limit
Reason: 3D lab demo code is grouped in one section file.
Split or Fix Plan: Split scene setup, controls, and examples.
Expires: Phase 4/5

File: src/components/settings/Tabs/ProvidersSettings.tsx
Owner: frontend/settings
Rule Exempted: TS/TSX hard file-size limit
Reason: Provider settings still owns provider list, editing, validation, and key state.
Split or Fix Plan: Split provider list, provider editor, key status, and connection tests.
Expires: Phase 4

File: src/components/ui/sidebar.tsx
Owner: frontend/ui
Rule Exempted: TS/TSX hard file-size limit
Reason: Generated UI primitive has many variants and subcomponents.
Split or Fix Plan: Leave until UI primitive review; avoid adding new behavior here.
Expires: Phase 5

File: src/components/widgets/workbench/InteractiveDrawingCanvas.tsx
Owner: frontend/workbench
Rule Exempted: TS/TSX hard file-size limit
Reason: Drawing state, rendering, tools, and interactions are colocated.
Split or Fix Plan: Split tool state, canvas renderer, selection, and export helpers.
Expires: Phase 4/5

```

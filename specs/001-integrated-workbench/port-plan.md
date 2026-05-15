# Port Plan: Tauri-chatbot → Zen Feature Adaptation

## Overview

Systematic plan for adapting high-value features from the reference Tauri-chatbot project into the Zen app. Organized into phases by dependency and priority.

---

## Phase 0: Store & Settings Infrastructure Overhaul

**Why first:** All downstream features depend on a robust store architecture. The current Zen store system is minimal — we need the full slice-based Zustand pattern with persistence, schema validation, and dirty-tracking.

### 0.1 — Slice-based Settings Store
- **Port:** `src/lib/stores/settings/` (6 slice files + schema + types + DESIGN.md) from ref
- **Adapt to Zen's existing `useSettingsStore.ts`** — merge the existing 3 fields into the new slice system
- **Add Zod schema validation** for all persisted settings (prevents corrupted localStorage crashes)
- **Add settingsMapper** for bidirectional camelCase ↔ snake_case mapping to SQLite
- **Files to create:**
  - `src/lib/stores/settings/schema.ts` — Zod schema
  - `src/lib/stores/settings/types.ts` — `SettingsState` interface
  - `src/lib/stores/settings/createAppSlice.ts` — App settings slice
  - `src/lib/stores/settings/createAiSlice.ts` — AI/chat settings slice
  - `src/lib/stores/settings/createAudioSlice.ts` — Audio settings slice
  - `src/lib/stores/settings/createInterfaceSlice.ts` — Interface settings slice
  - `src/lib/stores/settings/createProviderSlice.ts` — Provider configs slice
  - `src/lib/stores/settings/createSystemSlice.ts` — System settings slice
  - `src/lib/stores/settingsMapper.ts` — Camel ↔ snake mapping
  - `src/lib/stores/middleware/persistence.ts` — Persistence middleware
  - `src/lib/stores/useSettingsStore.ts` — **Rewrite** to compose all slices

### 0.2 — Additional Core Stores
- **Port sessionStore** → `src/lib/stores/sessionStore.ts` — Session CRUD, active session
- **Port agentActivityStore** → `src/lib/stores/agentActivityStore.ts` — Agent log/events
- **Port useSystemStore** → `src/lib/stores/useSystemStore.ts` — Hardware metrics
- **Port telemetryStore** → `src/lib/stores/telemetryStore.ts` — Real-time data buffer
- **Files to create:**
  - `src/lib/stores/sessionStore.ts`
  - `src/lib/stores/agentActivityStore.ts`
  - `src/lib/stores/useSystemStore.ts`
  - `src/lib/stores/telemetryStore.ts`

### 0.3 — Type Definitions
- **Port types from ref** → `src/types/` directory
- **Files to create:**
  - `src/types/agent_events.ts` — Agent event types
  - `src/types/session.ts` — Session data models
  - `src/types/drawing.ts` — Drawing annotation types

---

## Phase 1: Provider Configuration System

**Why next:** Without provider config, users can't configure API keys or switch LLM backends. This is the single most important feature gap.

### 1.1 — Provider Settings Tab (Major)
- **Port** 11 provider sub-components from `Tabs/providers/`
- **Adapt** to Zen's shadcn/ui design language (was using Workbench* components)
- **Files to create:**
  - `src/components/settings/Tabs/ProvidersSettings.tsx` — Main providers tab
  - `src/components/settings/Tabs/providers/constants.tsx` — Provider icons, key maps
  - `src/components/settings/Tabs/providers/ProviderHeader.tsx`
  - `src/components/settings/Tabs/providers/ApiKeyConfig.tsx`
  - `src/components/settings/Tabs/providers/EndpointConfig.tsx`
  - `src/components/settings/Tabs/providers/ModelConfig.tsx`
  - `src/components/settings/Tabs/providers/CustomProviderConfig.tsx`
  - `src/components/settings/Tabs/providers/ConnectionStatus.tsx`
  - `src/components/settings/Tabs/providers/ReliabilityConfig.tsx`
  - `src/components/settings/Tabs/providers/EmbeddingConfig.tsx`
  - `src/components/settings/Tabs/providers/ProviderDrawer.tsx`
  - `src/components/settings/Tabs/providers/AddCustomProviderModal.tsx`

### 1.2 — Register in SettingsModal
- Add `providers` tab to `TAB_GROUPS` in SettingsModal
- Add `ProviderSettings` icon (Shield/Laptop) to sidebar

---

## Phase 2: Session Management System

**Why high priority:** Enables multi-session organization, history browsing, and session persistence — a core UX feature.

### 2.1 — Session Store & Types
- Port `sessionStore.ts` with full CRUD operations
- Port session type definitions
- Add persistence middleware for auto-save

### 2.2 — Session Manager UI
- **Create:** `src/components/settings/Tabs/SessionsSettings.tsx` — Session config in settings
- **Create:** `src/components/modals/session-manager/` directory with:
  - `SessionActivityBar.tsx` — Session activity list
  - `SessionInspector.tsx` — Deep-dive into session details
  - `SessionList.tsx` — List/select/search sessions
  - `SessionMainContent.tsx` — Main session content panel
  - `SessionStatusBar.tsx` — Session status indicators
  - `types.ts` — Session manager types

### 2.3 — Session Manager Modal
- **Create:** `src/components/modals/ChatManagerModal.tsx` — Dialog wrapper
- Wire into ActivityBar / CommandPalette

---

## Phase 3: Remaining Settings Tabs (9 tabs)

**Why now:** Completes the settings surface area, filling all gaps.

### 3.1 — Core Feature Settings
| Tab | Path | Sub-components |
|-----|------|----------------|
| **MapsSettings** | `src/components/settings/Tabs/MapsSettings.tsx` | — |
| **MCPSettings** | `src/components/settings/Tabs/MCPSettings.tsx` | — |
| **SkillsSettings** | `src/components/settings/Tabs/SkillsSettings.tsx` | Sub-dir: `skills/constants.tsx` |
| **CommandsSettings** | `src/components/settings/Tabs/CommandsSettings.tsx` | — |
| **ModelsRoutingSettings** | `src/components/settings/Tabs/ModelsRoutingSettings.tsx` | — |

### 3.2 — Secondary Settings
| Tab | Path | Notes |
|-----|------|-------|
| **WidgetsSettings** | `src/components/settings/Tabs/WidgetsSettings.tsx` | Widget enable/disable |
| **ToolsSettings** | `src/components/settings/Tabs/ToolsSettings.tsx` | Tool permissions |
| **SpaceSettings** | `src/components/settings/Tabs/SpaceSettings.tsx` | Space data sources |
| **UpdatesSettings** | `src/components/settings/Tabs/UpdatesSettings.tsx` | Auto-update config |
| **HooksSettings** | `src/components/settings/Tabs/HooksSettings.tsx` | Event hooks |
| **PluginsSettings** | `src/components/settings/Tabs/PluginsSettings.tsx` | Plugin management |
| **RawSettings** | `src/components/settings/Tabs/RawSettings.tsx` | Raw JSON editor |

### 3.3 — Enhance Existing Settings Tabs
- Add sub-config forms to existing 8 tabs (agent config rows, directory config, etc.)
- **Files to create:**
  - `src/components/settings/Tabs/agents/AgentConfigRow.tsx` — Individual agent config
  - `src/components/settings/Tabs/agents/OrchestratorConfig.tsx` — Swarm config
  - `src/components/settings/Tabs/workspace/DirectoryConfig.tsx` — Directory settings
  - `src/components/settings/Tabs/workspace/SecurityArchitecture.tsx` — Security config
  - `src/components/settings/Tabs/chat/ChatBehaviorConfig.tsx` — Chat behavior sub-config
  - `src/components/settings/Tabs/audio/AudioDeviceConfig.tsx` — Audio device config
  - `src/components/settings/Tabs/system/PerformanceConfig.tsx` — Performance tuning
  - `src/components/settings/Tabs/gui/ThemeConfig.tsx` — Theme customization
  - `src/components/settings/Tabs/intelligence/RAGConfig.tsx` — RAG configuration

### 3.4 — Register All in SettingsModal
- Add new tabs to `TAB_GROUPS` in SettingsModal
- Organize into proper categories (General, AI & Chat, Interface, System)

---

## Phase 4: Sidebar Views

**Why medium priority:** Adds archival, knowledge, search, and template browsing to the sidebar.

### 4.1 — Sidebar View Components
- **Create:** `src/components/sidebar/` directory:
  - `ArchiveView.tsx` — Archived sessions browser
  - `FolderTree.tsx` — File system tree (port from workspace but adapt for sidebar)
  - `KnowledgeView.tsx` — Knowledge base browser
  - `SearchModal.tsx` — Full-text search UI
  - `TemplatesView.tsx` — Chat template picker

### 4.2 — Integrate with Sidebar
- Wire into `src/components/Zen/Sidebar.tsx` as additional view options
- Add to SecondaryActivityBar

---

## Phase 5: Missing Hooks (8 hooks)

**Why medium priority:** Enables app init flow, system metrics, sound effects, and other cross-cutting concerns.

### 5.1 — Core Hooks
| Hook | Path | Purpose |
|------|------|---------|
| **useAppInit** | `src/lib/hooks/useAppInit.ts` | App boot sequence (DB check, settings load) |
| **useChatRuntime** | `src/lib/hooks/useChatRuntime.ts` | Chat orchestration |
| **useSound** | `src/lib/hooks/useSound.ts` | Sound effects system |
| **useSysMetrics** | `src/lib/hooks/useSysMetrics.ts` | CPU/memory polling |

### 5.2 — Advanced Hooks
| Hook | Path | Purpose |
|------|------|---------|
| **useSessionSync** | `src/lib/hooks/useSessionSync.ts` | Session persistence sync |
| **useNavigation** | `src/lib/hooks/useNavigation.ts` | Navigation state management |
| **useThemeLoader** | `src/lib/hooks/useThemeLoader.ts` | Theme file loading |

---

## Phase 6: Shared Components

**Why medium priority:** Reusable UI building blocks that many features depend on.

### 6.1 — Shared Components
- **Create:** `src/components/shared/` directory:
  - `ContextBar.tsx` — Context indicator bar
  - `DialogWrapper.tsx` — Reusable dialog wrapper
  - `FileIcon.tsx` — File type icons
  - `FilePreviewContent.tsx` — File preview
  - `SearchableModelDropdown.tsx` — Model search/select
  - `SearchableModelList.tsx` — Model list
  - `Sparkline.tsx` — Inline sparkline chart
  - `SystemDiagnostics.tsx` — System health display
  - `TagManager.tsx` — Tag CRUD
  - `TerminalModal.tsx` — Terminal output modal
  - `WidgetRenderer.tsx` — Dynamic widget renderer

---

## Phase 7: Widgets System

**Why lower priority:** Rich feature but not critical — enables dashboard widgets.

### 7.1 — Widget Infrastructure
- **Create:** `src/components/widgets/` directory with:
  - `index.ts` — Widget registry/exports
  - `WidgetRenderer.tsx` — Dynamic widget mount (move from shared)
  - `ChartBlock.tsx` — Chart data display
  - `CodeExecutionBlock.tsx` — Code execution output
  - `VirtualizedCodeBlock.tsx` — Large code blocks
  - `ClockWidget.tsx` — Clock/time display
  - `UptimeWidget.tsx` — System uptime

### 7.2 — Hardware Monitoring Widgets
- `CpuMemWidget.tsx` — Combined CPU/memory
- `CpuWidget.tsx` — CPU graphs
- `MemoryWidget.tsx` — Memory usage
- `DiskWidget.tsx` — Disk usage
- `GpuWidget.tsx` — GPU monitoring
- `NetworkWidget.tsx` — Network traffic
- `LatencyWidget.tsx` — Latency tracking
- `TemperatureWidget.tsx` — Thermal monitoring

### 7.3 — Provider Widgets
- `ProviderWidget.tsx` — Provider status
- `ProviderUsageWidget.tsx` — Usage tracking
- `ModelWidget.tsx` — Active model info
- `TokenWidget.tsx` — Token usage display
- `StreamingWidget.tsx` — Live streaming stats

### 7.4 — Space Widgets
- `GlobeWidget.tsx` — 3D globe mini-view
- `SkyMapControls.tsx` — Star map controls
- `SpacekitEngine.tsx` — NASA horizon integration
- `StellariumEngine.tsx` — Stellarium overlay

### 7.5 — Data Widgets
- `DataTableWidget.tsx` — Tabular data
- `SearchResultCard.tsx` — Search result card
- `ChoiceSelectorWidget.tsx` — User choice widget
- `ClarificationWidget.tsx` — Clarification prompts
- `StepperWidget.tsx` — Multi-step wizard
- `SessionsWidget.tsx` — Active sessions list

---

## Phase 8: GTSM (Geospatial System) Enhancement

**Why lower priority:** Zen has a basic OperationalMap; this adds tactical overlays, layers, and target inspection.

### 8.1 — Enhanced Map Components
- **Enhance:** `src/components/workbench/OperationalMap.tsx` with:
  - `CameraControl.tsx` — 3D camera manipulation
  - `LayerManager.tsx` — Layer toggling
  - `Minimap.tsx` — Overview minimap
  - `ViewportHUD.tsx` — HUD overlay
  - `GtsmCrosshair.tsx` — Crosshair element
  - `LiveLogFeed.tsx` — Real-time logs

### 8.2 — Overlays & Analysis
- `ThreatHeatmapOverlay.tsx` — Threat zone visualization
- `WeatherHeatmapOverlay.tsx` — Weather overlay
- `TargetInspector.tsx` — Entity inspection
- `AIInsightCard.tsx` — AI analysis of map data
- `NavigationMap.tsx` / `NavigationPanel.tsx` — Navigation controls
- `VersionHistory.tsx` — Map state history

### 8.3 — Store Support
- **Create:** `src/lib/stores/gtsmStore.ts` — Map state, layers, targets
- **Create:** `src/lib/stores/swarmStore.ts` — Multi-agent state

---

## Phase 9: Canvas & Drawing System

**Why lower priority:** Nice-to-have for math/data visualization.

### 9.1 — Canvas Components
- **Create:** `src/components/canvas/` directory:
  - `CanvasPreview.tsx`
  - `InteractiveDrawingCanvas.tsx`
  - `GraphCanvas.tsx`
  - `DesmosCanvas.tsx`
  - `MathPlotInterface.tsx`

### 9.2 — Canvas Store & Types
- `src/lib/stores/drawingStore.ts` — Drawing state
- Update `src/types/drawing.ts` with canvas types

---

## Phase 10: Web Workers & Performance

**Why lower priority:** Optimization layer.

### 10.1 — Workers
- `src/utils/highlight.worker.ts` — Syntax highlighting offloading
- `src/lib/workers/heavyTransform.worker.ts` — Heavy computation
- `src/lib/workers/prism-setup.ts` — Highlight engine setup

### 10.2 — Performance Monitoring
- `src/lib/performance-monitor.ts` — FPS/memory tracking

---

## Phase 11: Services & API Clients

### 11.1 — Services
- `src/services/spaceObservatoryService.ts` — Space data API
- `src/lib/api/astronomy.ts` — Astronomy API client

### 11.2 — Utility Libraries
- `src/lib/chatHelpers.ts` — Chat utilities
- `src/lib/sessionUtils.ts` — Session helpers  
- `src/lib/webSpeech.ts` — Speech-to-text integration
- `src/lib/tauri-utils.ts` — Tauri IPC wrappers
- `src/lib/themes.ts` — Theme loading

---

## File Organization Summary

After all phases, Zen's `src/` will be organized as:

```
src/
├── atlas/                        # Core app views (existing)
├── components/
│   ├── canvas/                   # NEW: Drawing/canvas system
│   ├── chat/                     # Chat components (existing)
│   ├── modals/                   # NEW: Modal dialogs
│   │   └── session-manager/      # Session manager UI
│   ├── settings/                 # Settings infrastructure (existing)
│   │   ├── Tabs/                 # 21 settings tabs (8 existing + 13 new)
│   │   │   ├── agents/           # Agent sub-configs
│   │   │   ├── audio/            # Audio sub-configs
│   │   │   ├── chat/             # Chat sub-configs
│   │   │   ├── gui/              # GUI sub-configs
│   │   │   ├── intelligence/     # Intelligence sub-configs
│   │   │   ├── providers/        # Provider sub-configs (11 files)
│   │   │   ├── skills/           # Skills sub-configs
│   │   │   ├── system/           # System sub-configs
│   │   │   ├── terminal/         # Terminal sub-configs
│   │   │   └── workspace/        # Workspace sub-configs
│   │   └── ui/                   # Settings-specific UI (existing empty)
│   ├── shared/                   # NEW: Shared components
│   ├── sidebar/                  # NEW: Sidebar views
│   ├── ui/                       # shadcn/ui primitives (existing)
│   ├── widgets/                  # NEW: Widget dashboard system
│   ├── workbench/                # Workbench panels (existing)
│   └── Zen/                      # App shell layout (existing)
├── hooks/ or lib/hooks/          # Hooks (existing + new)
├── lib/
│   ├── api/                      # NEW: API clients
│   ├── stores/                   # Stores (existing + new)
│   │   ├── middleware/           # NEW: Persistence middleware
│   │   ├── settings/             # NEW: Settings slices (6 files)
│   │   └── slices/               # NEW: Store slices
│   ├── workers/                  # NEW: Web workers
│   └── utils/                    # Utilities (existing)
├── services/                     # NEW: Service layer
├── styles/                       # Styles (existing)
├── types/                        # NEW: Global types
└── utils/                        # Utilities (existing + workers)
```

---

## Recommendation: Execution Order

### Sprint 1 — Foundation (Phases 0-1)
1. **Phase 0.1**: Slice-based settings store + Zod schema
2. **Phase 0.3**: Type definitions
3. **Phase 1.1**: Provider settings tab (11 sub-components)
4. **Phase 1.2**: Register in SettingsModal

### Sprint 2 — Sessions + Tabs (Phases 2-3)
5. **Phase 2.1-2.3**: Session management store + UI
6. **Phase 3.1**: Maps, MCP, Skills, Commands, ModelsRouting tabs
7. **Phase 3.2**: Secondary tabs (Widgets, Tools, Space, Updates, etc.)
8. **Phase 3.3**: Enhanced existing tabs with sub-configs

### Sprint 3 — Sidebar & Hooks (Phases 4-5)
9. **Phase 4**: Sidebar views (Archive, Knowledge, Search, etc.)
10. **Phase 5**: Core hooks (useAppInit, useChatRuntime, useSound, etc.)

### Sprint 4 — Shared, Widgets, GTSM (Phases 6-8)
11. **Phase 6**: Shared components
12. **Phase 7**: Widget system (hardware/space/provider/data widgets)
13. **Phase 8**: GTSM tactical map enhancement

### Sprint 5 — Canvas, Workers, Services (Phases 9-11)
14. **Phase 9**: Canvas/drawing system
15. **Phase 10**: Web workers + performance
16. **Phase 11**: Services & API clients

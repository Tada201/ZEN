# UI Data Model: Integrated Workbench

## Entities

### WorkbenchState (Zustand)
Manages the visual state of the IDE workbench.

| Field | Type | Description |
| :--- | :--- | :--- |
| `sidebarOpen` | boolean | Toggles primary sidebar visibility |
| `sidebarWidth` | number | Resizable width (default 240px) |
| `activeTab` | string | Currently active main area module (e.g., 'map', 'chat') |
| `activeSidebarPanel` | string | Current panel in sidebar (e.g., 'explorer', 'agents', 'search') |
| `isCommandPaletteOpen` | boolean | Toggle for Cmd+K palette |
| `theme` | 'dark' \| 'light' \| 'tactical' | Current visual theme |
| `styleMode` | 'glass' \| 'flat' \| 'bordered' | Visual styling modifier |

### UserPreferences (Local Persistence)
Persisted across sessions.

| Field | Type | Description |
| :--- | :--- | :--- |
| `preferredTheme` | string | User's chosen theme |
| `density` | 'normal' \| 'compact' | UI information density |
| `animationsEnabled` | boolean | Toggle for framer-motion animations |

## Events & Transitions
- `TOGGLE_SIDEBAR`: Animates sidebar in/out.
- `SWITCH_TAB`: Switches primary content with a fade transition.
- `OPEN_COMMAND_PALETTE`: Overlays the palette on the Z-index system.

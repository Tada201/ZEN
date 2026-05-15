# Research: Integrated Workbench Shell

**Date**: 2026-05-13
**Feature**: `001-integrated-workbench`

## Decision: Atlas UI Token Adoption
- **Choice**: Use the full HSL token system from `ui-atlas`.
- **Rationale**: Provides the necessary "premium" feel and supports advanced style modes (Glass, Tactical, Flat).
- **Alternatives Considered**: Standard Tailwind colors (rejected as too generic).

## Decision: Layout Strategy
- **Choice**: Multi-pane IDE layout (Activity Bar + Sidebar + Main Area).
- **Rationale**: Proven ergonomic standard for high-density information apps (like VS Code, Cursor, Palantir).
- **Alternatives Considered**: Single-pane chat (rejected as insufficient for OSINT).

## Decision: Main Area Composition
- **Choice**: Split-pane or Tabbed view for Map and Chat.
- **Rationale**: Allows the user to keep eyes on the 3D telemetry while interacting with agents.
- **Alternatives Considered**: Modal chat (rejected as disruptive to spatial awareness).

## Best Practices: CesiumJS in React
- **Decision**: Use a dedicated `CesiumCanvas` component with a `useImperativeHandle` for globe controls.
- **Rationale**: Decouples React's render cycle from Cesium's internal WebGL loop, preventing lag.

## Best Practices: Command Palette
- **Decision**: Implement using `cmdk` library or similar lightweight primitive.
- **Rationale**: High performance and accessible by default.

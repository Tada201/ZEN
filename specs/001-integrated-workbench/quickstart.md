# Quickstart: Integrated Workbench Shell

## Prerequisites
- Node.js 20+
- Rust 1.75+ (for Tauri 2.0)

## Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run in Development Mode**
   ```bash
   # Launch the Tauri desktop app
   npm run tauri dev
   ```

3. **Verify the Shell**
   - Ensure the **Activity Bar** appears on the left.
   - Click the **Map** icon to verify Cesium initialization.
   - Use **Cmd+K** (or Ctrl+K) to open the Command Palette.
   - Toggle **Dark/Light** mode in the Status Bar (if implemented).

## Key Commands
- `npm run dev`: Run frontend only (for rapid UI styling).
- `npm run build`: Build production desktop binaries.

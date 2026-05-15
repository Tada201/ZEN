# Zen Constitution

<!--
Sync Impact Report:
- Version change: 0.3.0 → 0.3.1
- List of modified principles:
  - Added VI. Tauri-First & Native Integrity (prohibiting browser agents for verification)
- Removed sections: None
- Templates requiring updates: ✅ updated (Generic templates verified)
- Follow-up TODOs: None
-->

## Core Principles

### I. Sovereignty & "Sousveillance"
Zen is built on the principle of the "reverse panopticon"—redirecting elite surveillance tools toward community transparency and regeneration. The platform must transition from passive observation to active intervention, identifying solution paths for environmental and social vitality through "Truth Lines."

### II. High-Precision Spatial Intelligence
Every 3D city block and orbital asset is a dynamic node in a global vitality network. Zen utilizes high-precision WGS84 globes (CesiumJS) and 4D visualization (spatial + temporal) to provide sub-millimeter accuracy for real-time OSINT analysis and voyage replay.

### III. Agentic GIS & Multi-Agent Orchestration
Spatial analysis is driven by autonomous AI agents (LangGraph) that automate complex investigatory pipelines. Agents must follow a Reasoning + Acting (ReAct) loop to correlate fragmented data (WHOIS, DNS, geolocation, PII filtering) into actionable narratives using the Model Context Protocol (MCP).

### IV. Resilient "God Mode" Telemetry
The platform must handle extreme performance demands, fusing ADS-B (aviation), AIS (maritime), and TLE (satellite) data streams. The architecture utilizes binary-encoded formats (FlatBuffers/Avro) and hardware-accelerated shaders (WebGPU) to maintain 60 FPS while monitoring 20,000+ moving entities.

### V. Sovereign & Compliant Operations
Adhere strictly to localized regulations, with a primary focus on Vietnam (PDPL Law 91/2025, Decree 53, Survey and Mapping Law). We prioritize data localization, national security compliance, and A05 MPS reporting while maintaining decentralized data validation.

### VI. Tauri-First & Native Integrity
Zen is architected as a native application via Tauri 2.0. Standard browser agents (e.g., Playwright/Puppeteer in headless mode) are prohibited for final verification, as the application utilizes native OS APIs and system-level integrations that cannot be accurately emulated in a standard browser. All verification must be performed within the Tauri runtime environment.

## Technology Stack
- **Core Engine**: React 19, Tauri 2.0 (Rust backend), Vite, Tailwind CSS 4
- **Geospatial & Viz**: CesiumJS (3D Tiles), WebGPU (GLSL Shaders), Three.js (NVG/FLIR Filters)
- **AI Orchestration**: LangGraph, FastAPI (Python 3.12), Model Context Protocol (MCP)
- **Telemetry Ingestion**: Axum (Rust), Redis (Real-time caching), FlatBuffers (Binary transport)
- **Storage & Memory**: Weaviate (Vector memory), SQLite/SurrealDB (Local state), PostgreSQL (Sovereign data)
- **Data Providers**: OpenSky, ADS-B Exchange, Kpler (AIS), NCHMF Weather, HCMC Traffic Cams

## Development Workflow
1. **Define**: Create feature specifications in `.specify/memory/specs/`.
2. **Plan**: Generate technical implementation plans in `.specify/memory/plans/`.
3. **Track**: Break down plans into granular tasks in `tasks.md`.
4. **Build**: Execute tasks using Red-Green-Refactor with "Vibe-Coding" AI assistance.

## Governance
- This constitution supersedes all other project practices.
- Amendments require a version bump and an updated Sync Impact Report.
- All code changes must be verified against these principles using the `/speckit.analyze` skill.

**Version**: 0.3.1 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-05-13 (v0.3.1)

//! App-side agent adapters.
//!
//! The agent runtime (runner, orchestrator, router, event bus, skills, types,
//! …) lives in the `zen-agent` crate; consumers import it from `zen_agent::`
//! directly. Only what cannot live in a crate stays here:
//!
//! - `tools/` — leaf tool executors that reach `AppState` through Tauri's
//!   `AppHandle`, registered into the host-generic zen-tools registries.
//! - `clarification.rs` — a `#[tauri::command]`; commands are adapters and
//!   belong to the app crate.
pub mod clarification;
pub mod tools;

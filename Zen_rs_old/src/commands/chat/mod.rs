//! Chat-related Tauri commands.
//!
//! Layout (each file is a sibling submodule, all kept under the file-size
//! limits set in `RULES.md`):
//!   `helpers`   — shared keyword matchers and defaults.
//!   `crud`      — create/get/list/delete + bulk delete.
//!   `send`      — `send_message` (the heavy lifter).
//!   `title`     — title generation + update.
//!   `repair`    — one-shot Mermaid diagram repair via the active model.
//!   `archive`   — pin / archive / unarchive / list-archived.
//!   `tags`      — tag listing + chat search.
//!   `folders`   — chat folder CRUD.
//!   `lifecycle` — bulk archive, fork, abort, export, import.

mod archive;
mod crud;
mod folders;
mod helpers;
mod lifecycle;
mod repair;
mod send;
mod tags;
mod title;
mod trace;

pub use archive::*;
pub use crud::*;
pub use folders::*;
pub use helpers::{sanitize_title, ThinkingConfig};
pub use lifecycle::*;
pub use repair::*;
pub use send::*;
pub use tags::*;
pub use title::*;
pub use trace::*;

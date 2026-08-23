//! Reasoning capability resolution — types live in zen-core since Phase 3;
//! the resolver and registry data stay in the app crate until Phase 7.

pub mod registry;
pub mod resolver;

pub use zen_core::reasoning::*;

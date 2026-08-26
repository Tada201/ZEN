//! Reasoning capability resolution. The DTOs live in zen-core because the agent
//! runtime and the provider layer both speak them; the resolver and the
//! per-model registry data are provider concerns and live here.

pub mod registry;
pub mod resolver;

pub use zen_core::reasoning::*;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// Cache entry for tool results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub result: serde_json::Value,
    pub timestamp: u64,
    pub ttl_secs: u64,
}

impl CacheEntry {
    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now > self.timestamp + self.ttl_secs
    }
}

/// Tool result cache with TTL support
pub struct ToolCache {
    cache: HashMap<String, CacheEntry>,
    default_ttl_secs: u64,
}

impl ToolCache {
    pub fn new(default_ttl_secs: u64) -> Self {
        Self {
            cache: HashMap::new(),
            default_ttl_secs,
        }
    }

    /// Generate cache key from tool name + arguments (canonical JSON for consistent hashing)
    pub fn generate_key(tool_name: &str, args: &serde_json::Value) -> String {
        let mut hasher = Sha256::new();
        hasher.update(tool_name.as_bytes());
        hasher.update(b":");
        // Canonical JSON for consistent cache key (serde_json sorts keys in maps)
        let canonical = serde_json::to_string(args).unwrap_or_else(|_| args.to_string());
        hasher.update(canonical.as_bytes());
        let hash = hasher.finalize();
        format!("{}{:x}", tool_name, hash)
    }

    /// Get cached result if available and not expired
    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.cache.get(key).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(&entry.result)
            }
        })
    }

    /// Cache a tool result with default TTL
    pub fn set(&mut self, key: String, result: serde_json::Value) {
        self.set_with_ttl(key, result, self.default_ttl_secs);
    }

    /// Cache a tool result with custom TTL
    pub fn set_with_ttl(&mut self, key: String, result: serde_json::Value, ttl_secs: u64) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        self.cache.insert(
            key,
            CacheEntry {
                result,
                timestamp,
                ttl_secs,
            },
        );
    }

    /// Remove a specific cache entry
    pub fn remove(&mut self, key: &str) -> bool {
        self.cache.remove(key).is_some()
    }

    /// Clear all expired entries
    pub fn cleanup_expired(&mut self) -> usize {
        let expired_keys: Vec<String> = self
            .cache
            .iter()
            .filter(|(_, entry)| entry.is_expired())
            .map(|(key, _)| key.clone())
            .collect();

        let count = expired_keys.len();
        for key in expired_keys {
            self.cache.remove(&key);
        }
        count
    }

    /// Clear entire cache
    pub fn clear(&mut self) {
        self.cache.clear();
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let total = self.cache.len();
        let expired = self
            .cache
            .values()
            .filter(|e| e.timestamp + e.ttl_secs < now)
            .count();
        let active = total - expired;

        CacheStats {
            total,
            active,
            expired,
        }
    }
}

/// Cache statistics for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total: usize,
    pub active: usize,
    pub expired: usize,
}

impl Default for ToolCache {
    fn default() -> Self {
        // Safety-net default only. Callers should pass a tool-specific TTL via
        // `set_with_ttl` whenever possible — see `ttl_for_tool`.
        // Keep this short so any accidental blanket write expires quickly.
        Self::new(60)
    }
}

/// Returns the cache TTL in seconds for a tool, or `None` if the tool should
/// not be cached at all. The allowlist is restricted to deterministic,
/// side-effect-free discovery and read-only tools. Anything that mutates
/// workspace state, the network, or the local process returns `None` and is
/// expected to invalidate the cache on completion.
pub fn ttl_for_tool(tool_name: &str) -> Option<u64> {
    match tool_name {
        // Discovery / metadata — long TTL (1 hour)
        "tool_list" | "tool_info" => Some(3600),
        // Pure math — long TTL (1 hour)
        "calculator" => Some(3600),
        // System metrics — short TTL (30s, values change over time)
        "system_metrics" | "get_system_metrics" => Some(30),
        // Geocoding — medium TTL (5 min)
        "geocode_search" | "reverse_geocode" => Some(300),
        // Weather — medium TTL (10 min)
        "get_weather" => Some(600),
        // Live tactical feeds — short TTL (60s)
        "get_earthquakes" | "get_military_aircraft" => Some(60),
        // External web reads — short TTL (5 min)
        "web_search" | "web_fetch" => Some(300),
        // Local document queries — short TTL (60s, files may change)
        "list_documents" | "read_document_content" | "grep_documents" => Some(60),
        // Vector search over local index — medium TTL (5 min)
        "vector_search" => Some(300),
        // Routing — medium TTL (10 min)
        "calculate_route" => Some(600),
        // Everything else: not cacheable. Mutating tools (run_command,
        // write_file, edit_file, spawn_agent, handoff_to_agent,
        // generate_image, write_to_memory, set_workspace_folder, …) fall
        // through to this branch and must invalidate the cache after
        // executing.
        _ => None,
    }
}

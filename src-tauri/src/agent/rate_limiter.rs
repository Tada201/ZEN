//! Token-bucket rate limiter for tool execution.
//!
//! Prevents runaway tool calls by limiting the number of executions
//! per tool per time window. Uses a leaky-bucket algorithm where tokens
//! refill at a steady rate.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// A single token bucket that refills over time.
struct TokenBucket {
    /// Maximum tokens (burst capacity)
    max_tokens: u32,
    /// Current available tokens
    tokens: f64,
    /// Tokens added per second
    refill_rate: f64,
    /// Last time tokens were refilled
    last_refill: Instant,
}

impl TokenBucket {
    fn new(max_tokens: u32, refill_rate: f64) -> Self {
        Self {
            max_tokens,
            tokens: max_tokens as f64,
            refill_rate,
            last_refill: Instant::now(),
        }
    }

    /// Refill tokens based on elapsed time since last refill.
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.max_tokens as f64);
        self.last_refill = now;
    }

    /// Try to consume one token. Returns true if allowed, false if rate limited.
    fn try_consume(&mut self) -> bool {
        self.refill();
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Per-tool rate limiter using token buckets.
///
/// Default: 20 calls per minute per tool, with burst capacity of 5.
#[derive(Clone)]
pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, TokenBucket>>>,
    default_max_tokens: u32,
    default_refill_rate: f64,
}

impl RateLimiter {
    /// Create a new rate limiter with default settings.
    /// Default: 20 calls/min, burst of 5.
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
            default_max_tokens: 5,
            default_refill_rate: 20.0 / 60.0, // 20 per minute = ~0.333 per second
        }
    }

    /// Create a rate limiter with custom defaults.
    pub fn with_limits(max_tokens: u32, calls_per_minute: f64) -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
            default_max_tokens: max_tokens,
            default_refill_rate: calls_per_minute / 60.0,
        }
    }

    /// Check if a tool call is allowed. Returns true if within rate limit.
    pub async fn check(&self, tool_name: &str) -> bool {
        let mut buckets = self.buckets.lock().await;
        let bucket = buckets
            .entry(tool_name.to_string())
            .or_insert_with(|| TokenBucket::new(
                self.default_max_tokens,
                self.default_refill_rate,
            ));
        bucket.try_consume()
    }

    /// Reset rate limit for a specific tool.
    pub async fn reset(&self, tool_name: &str) {
        let mut buckets = self.buckets.lock().await;
        buckets.remove(tool_name);
    }

    /// Reset all rate limits.
    pub async fn reset_all(&self) {
        let mut buckets = self.buckets.lock().await;
        buckets.clear();
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_basic_rate_limit() {
        let limiter = RateLimiter::with_limits(3, 60.0); // 3 burst, 60/min refill

        // First 3 should succeed (burst capacity)
        assert!(limiter.check("test_tool").await);
        assert!(limiter.check("test_tool").await);
        assert!(limiter.check("test_tool").await);

        // 4th should fail (bucket empty)
        assert!(!limiter.check("test_tool").await);

        // Different tool should succeed
        assert!(limiter.check("other_tool").await);
    }

    #[tokio::test]
    async fn test_token_refill() {
        let limiter = RateLimiter::with_limits(1, 10.0); // 1 burst, 10/min = ~0.167/sec

        // Consume the one token
        assert!(limiter.check("test_tool").await);
        // Second should fail
        assert!(!limiter.check("test_tool").await);

        // Wait for refill (need ~6 seconds for 1 token at 10/min)
        tokio::time::sleep(std::time::Duration::from_secs(7)).await;

        // Should succeed again
        assert!(limiter.check("test_tool").await);
    }

    #[tokio::test]
    async fn test_reset() {
        let limiter = RateLimiter::with_limits(1, 60.0);

        assert!(limiter.check("test_tool").await);
        assert!(!limiter.check("test_tool").await);

        limiter.reset("test_tool").await;
        assert!(limiter.check("test_tool").await);
    }
}

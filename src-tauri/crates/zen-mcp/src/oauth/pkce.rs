//! PKCE (RFC 7636) code verifier/challenge generation for the MCP OAuth
//! 2.1 authorization-code flow.
//!
//! No `rand` crate: the verifier's entropy comes from concatenated UUID v4
//! byte blocks (122 bits of CSPRNG entropy each, sourced from `getrandom`
//! via the `uuid` crate), base64url-encoded to the RFC-mandated
//! 43..=128-character unreserved-charset verifier. The challenge is
//! `BASE64URL(SHA256(verifier))` (the `S256` method — `plain` is never used).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use sha2::{Digest, Sha256};

/// A PKCE verifier + its S256 challenge, generated together so they always
/// match. The verifier is secret (kept in memory only for the duration of a
/// single authorization) and never logged.
#[derive(Clone)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

impl PkcePair {
    /// Generate a fresh pair. The verifier is 96 bytes of UUID-v4 entropy
    /// (4 blocks × 16 raw bytes → 128 base64url chars, the RFC ceiling).
    pub fn generate() -> Self {
        let mut entropy = Vec::with_capacity(64);
        while entropy.len() < 64 {
            entropy.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
        }
        entropy.truncate(64);
        // 64 bytes → 86 base64url chars, comfortably within 43..=128.
        let verifier = URL_SAFE_NO_PAD.encode(&entropy);
        let challenge = Self::challenge_for(&verifier);
        Self {
            verifier,
            challenge,
        }
    }

    /// `BASE64URL(SHA256(ascii(verifier)))`.
    fn challenge_for(verifier: &str) -> String {
        let digest = Sha256::digest(verifier.as_bytes());
        URL_SAFE_NO_PAD.encode(digest)
    }
}

/// An opaque, URL-safe `state` value for CSRF protection on the redirect.
pub fn random_state() -> String {
    URL_SAFE_NO_PAD.encode(uuid::Uuid::new_v4().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_within_rfc_bounds_and_challenge_matches() {
        let pair = PkcePair::generate();
        assert!(
            (43..=128).contains(&pair.verifier.len()),
            "verifier length {} out of RFC 7636 bounds",
            pair.verifier.len()
        );
        // Charset: unreserved base64url (no '+' '/' '=').
        assert!(pair
            .verifier
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        // Challenge must be the S256 of the verifier, recomputable.
        assert_eq!(pair.challenge, PkcePair::challenge_for(&pair.verifier));
        // Two generations differ (entropy sanity).
        assert_ne!(pair.verifier, PkcePair::generate().verifier);
    }
}

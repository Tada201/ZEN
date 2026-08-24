//! Structural classification of sub-agent failures.

use crate::error::ZenError;

/// Classification for errors returned by a sub-agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ErrorClass {
    Transient,
    Permanent,
    Retryable,
}

impl ErrorClass {
    pub(super) fn as_str(&self) -> &'static str {
        match self {
            ErrorClass::Transient => "transient",
            ErrorClass::Permanent => "permanent",
            ErrorClass::Retryable => "retryable",
        }
    }
}

/// Typed failure cause for a sub-agent run, constructed at the known failure
/// sites inside `do_spawn`. Carrying the cause structurally means downstream
/// classification (cancelled-vs-failed terminal status, retry hints) reads
/// the marker instead of re-matching our own error wording, which silently
/// broke whenever a message changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SpawnFailure {
    /// The user stopped this sub-agent explicitly.
    UserCancelled,
    /// The parent run was cancelled or aborted, taking the child with it.
    ParentCancelled,
    /// The child exceeded `SUBAGENT_TIMEOUT_SECONDS`.
    Timeout,
}

#[derive(Debug)]
pub(super) struct SpawnFailureError {
    kind: SpawnFailure,
    message: String,
}

impl SpawnFailureError {
    pub(super) fn new(kind: SpawnFailure, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl std::fmt::Display for SpawnFailureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for SpawnFailureError {}

/// Structurally classify a sub-agent failure.
///
/// Known spawn failures (cancellation, timeout) map directly from their typed
/// marker; provider errors classify from their `ZenError` shape — HTTP status
/// class, reqwest failure kind, or explicit variants like `NoModelSelected`.
/// Anything opaque falls into the generic `Retryable` bucket instead of
/// guessing from message wording.
pub(super) fn classify_spawn_error(error: &anyhow::Error) -> ErrorClass {
    for cause in error.chain() {
        if let Some(failure) = cause.downcast_ref::<SpawnFailureError>() {
            return match failure.kind {
                SpawnFailure::UserCancelled
                | SpawnFailure::ParentCancelled
                | SpawnFailure::Timeout => ErrorClass::Transient,
            };
        }
        if let Some(zen) = cause.downcast_ref::<ZenError>() {
            match zen {
                ZenError::Aborted => return ErrorClass::Transient,
                ZenError::NoModelSelected | ZenError::ContextTooLarge(..) => {
                    return ErrorClass::Permanent;
                }
                ZenError::Http(http) => {
                    if let Some(status) = http.status {
                        if status == 429 || (500..=599).contains(&status) {
                            return ErrorClass::Transient;
                        }
                        // Other 4xx (401/403/404/400…): the request itself is
                        // wrong; retrying unchanged cannot help.
                        return ErrorClass::Permanent;
                    }
                    if http.timeout || http.connect {
                        return ErrorClass::Transient;
                    }
                    return ErrorClass::Retryable;
                }
                // Other variants carry no class signal — keep walking the
                // chain so a wrapped provider error deeper in still counts.
                _ => continue,
            };
        }
    }
    ErrorClass::Retryable
}

/// Terminal status for a failed sub-agent run: cancellation is surfaced as
/// `cancelled` (not `failed`) only when the typed marker says so.
pub(super) fn spawn_failure_status(error: &anyhow::Error) -> &'static str {
    let cancelled = error.chain().any(|cause| {
        cause.downcast_ref::<SpawnFailureError>().is_some_and(|failure| {
            matches!(failure.kind, SpawnFailure::UserCancelled | SpawnFailure::ParentCancelled)
        })
    });
    if cancelled { "cancelled" } else { "failed" }
}

#[cfg(test)]
mod tests {
    use super::*;


    #[test]
    fn user_cancelled_spawn_maps_to_cancelled_status_and_transient_class() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::UserCancelled,
            "Sub-agent task cancelled by user",
        ));
        assert_eq!(spawn_failure_status(&error), "cancelled");
        assert_eq!(classify_spawn_error(&error), ErrorClass::Transient);
    }

    #[test]
    fn parent_cancelled_spawn_maps_to_cancelled_status() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::ParentCancelled,
            "Parent cancelled — sub-agent aborted",
        ));
        assert_eq!(spawn_failure_status(&error), "cancelled");
    }

    #[test]
    fn timeout_spawn_maps_to_failed_status_and_transient_class() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::Timeout,
            "Sub-agent timed out after 300 seconds",
        ));
        assert_eq!(spawn_failure_status(&error), "failed");
        assert_eq!(classify_spawn_error(&error), ErrorClass::Transient);
    }

    #[test]
    fn provider_shape_classifies_without_matching_wording() {
        // NoModelSelected is permanent regardless of its message text.
        let no_model = anyhow::Error::new(ZenError::NoModelSelected);
        assert_eq!(classify_spawn_error(&no_model), ErrorClass::Permanent);
        // Aborted (user stop) is transient.
        let aborted = anyhow::Error::new(ZenError::Aborted);
        assert_eq!(classify_spawn_error(&aborted), ErrorClass::Transient);
    }

    #[test]
    fn opaque_error_falls_back_to_retryable_and_failed_status() {
        let opaque = anyhow::anyhow!("provider exploded in a novel way");
        assert_eq!(classify_spawn_error(&opaque), ErrorClass::Retryable);
        assert_eq!(spawn_failure_status(&opaque), "failed");
    }

    #[test]
    fn typed_marker_survives_anyhow_context_wrapping() {
        let inner = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::UserCancelled,
            "Sub-agent task cancelled by user",
        ));
        let wrapped = inner.context("while running child agent");
        assert_eq!(spawn_failure_status(&wrapped), "cancelled");
    }
}

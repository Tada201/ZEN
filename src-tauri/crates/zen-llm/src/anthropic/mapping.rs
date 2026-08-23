//! Model-id heuristics for the Anthropic provider (Phase 7 file-split).

/// Resolve an Anthropic model's reasoning capability via the version-aware
/// registry. Newer Claude families (4.5/4.6/4.7) use adaptive thinking; 3.7
/// uses manual budget; older/unknown families fall back to `unknown`.
pub(crate) fn anthropic_reasoning_metadata(model_id: &str) -> crate::ReasoningCapability {
    crate::reasoning::resolver::resolve(
        "anthropic",
        model_id,
        &crate::reasoning::resolver::RawReasoningMetadata::default(),
    )
}

/// Hardcoded context-length lookup for known Anthropic models, used when the
/// API response does not include `max_input_tokens` (e.g. for retired models
/// still present in the fallback list).
pub(crate) fn anthropic_context_length_from_id(model_id: &str) -> Option<u64> {
    let id = model_id.to_lowercase();
    // 1M-context models (Claude 4.6+, Sonnet 5, Fable 5, Mythos 5)
    if id.contains("opus-4-8")
        || id.contains("opus-4-7")
        || id.contains("opus-4-6")
        || id.contains("sonnet-4-6")
        || id.contains("sonnet-5")
        || id.contains("fable-5")
        || id.contains("mythos-5")
    {
        return Some(1_000_000);
    }
    // 200K-context models (Claude 4.5 Sonnet, 3.7 Sonnet, 3.5 Sonnet, Haiku 4.5, etc.)
    Some(200_000)
}
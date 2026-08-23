//! Reasoning-emission helpers for the openai_compat SSE pipeline.
//! Moved out of stream.rs during the Phase 7 crate extraction.

use serde_json::Value;

use super::types::{OpenAiDelta, OpenAiStreamMessage};
use super::OpenAiCompatProvider;
use zen_core::ReasoningBlock;


impl OpenAiCompatProvider {
    pub(crate) fn reasoning_value_to_string(value: &Value) -> Option<String> {
        match value {
            Value::String(text) if !text.is_empty() => Some(text.clone()),
            Value::Array(items) => {
                let text = items
                    .iter()
                    .filter_map(Self::reasoning_value_to_string)
                    .collect::<String>();
                (!text.is_empty()).then_some(text)
            }
            Value::Object(map) => [
                "content",
                "text",
                "reasoning",
                "reasoning_content",
                "thinking",
            ]
            .iter()
            .find_map(|key| map.get(*key).and_then(Self::reasoning_value_to_string)),
            _ => None,
        }
    }

    pub(crate) fn reasoning_block_from_value(
        &self,
        block_type: &str,
        value: &Value,
    ) -> Option<ReasoningBlock> {
        let text = Self::reasoning_value_to_string(value);
        if text.is_none() && value.is_null() {
            return None;
        }

        Some(ReasoningBlock {
            provider: self.provider_name.clone(),
            block_type: block_type.to_string(),
            text,
            raw: Some(value.clone()),
        })
    }

    pub(crate) fn emit_reasoning_value(
        &self,
        block_type: &str,
        value: Option<&Value>,
        on_chunk: &(dyn Fn(crate::LlmChunk) + Send),
    ) -> Option<ReasoningBlock> {
        let block = value.and_then(|value| self.reasoning_block_from_value(block_type, value));
        if let Some(thought) = block.as_ref().and_then(|block| block.text.as_ref()) {
            on_chunk(crate::LlmChunk::Thought(thought.clone()));
        }
        block
    }

    pub(crate) fn emit_reasoning_delta(
        &self,
        delta: &OpenAiDelta,
        on_chunk: &(dyn Fn(crate::LlmChunk) + Send),
        reasoning_details: &mut Vec<ReasoningBlock>,
    ) {
        for block in [
            self.emit_reasoning_value("reasoning", delta.reasoning.as_ref(), on_chunk),
            self.emit_reasoning_value(
                "reasoning_content",
                delta.reasoning_content.as_ref(),
                on_chunk,
            ),
            self.emit_reasoning_value("thinking", delta.thinking.as_ref(), on_chunk),
        ]
        .into_iter()
        .flatten()
        {
            reasoning_details.push(block);
        }
    }

    pub(crate) fn emit_reasoning_message(
        &self,
        message: &OpenAiStreamMessage,
        on_chunk: &(dyn Fn(crate::LlmChunk) + Send),
        reasoning_details: &mut Vec<ReasoningBlock>,
    ) {
        for block in [
            self.emit_reasoning_value("reasoning", message.reasoning.as_ref(), on_chunk),
            self.emit_reasoning_value(
                "reasoning_content",
                message.reasoning_content.as_ref(),
                on_chunk,
            ),
        ]
        .into_iter()
        .flatten()
        {
            reasoning_details.push(block);
        }
    }
}
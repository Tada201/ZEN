17s
23s
1m 51s
17s
7s
3s
8s
3m 39s
31m 52s
2m 49s
Run cargo clippy --all-targets -- -D warnings
  
   Compiling zen v0.1.0 (D:\a\ZEN\ZEN\src-tauri)
error: empty line after doc comment
 --> src\agent\utils.rs:1:1
  |
1 | / /// Shared utilities for the agent system.
2 | |
  | |_^
3 |   /// Returns the current Unix epoch time in milliseconds.
4 |   pub fn now_ms() -> i64 {
  |   ------------- the comment documents this function
  |
  = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#empty_line_after_doc_comments
  = note: `-D clippy::empty-line-after-doc-comments` implied by `-D warnings`
  = help: to override `-D warnings` add `#[allow(clippy::empty_line_after_doc_comments)]`
  = help: if the empty line is unintentional, remove it
help: if the comment should document the parent module use an inner doc comment
  |
1 - /// Shared utilities for the agent system.
1 + //! Shared utilities for the agent system.
  |
help: if the documentation should include the empty line include it in the comment
  |
2 | ///
  |

error: function `nine_router_search_fallback` is never used
   --> src\search\tool.rs:193:10
    |
193 | async fn nine_router_search_fallback(
    |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = note: `-D dead-code` implied by `-D warnings`
    = help: to override `-D warnings` add `#[expect(dead_code)]` or `#[allow(dead_code)]`

error: redundant closure
  --> src\agent\clarification.rs:56:64
   |
56 |     let options_json = serde_json::to_string(&options).map_err(|e| ZenError::Json(e))?;
   |                                                                ^^^^^^^^^^^^^^^^^^^^^ help: replace the closure with the tuple variant itself: `ZenError::Json`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#redundant_closure
   = note: `-D clippy::redundant-closure` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::redundant_closure)]`

error: this function has too many arguments (8/7)
  --> src\agent\deep_research.rs:12:1
   |
12 | / pub async fn run_deep_research(
13 | |     app: AppHandle,
14 | |     db: sqlx::SqlitePool,
15 | |     llm_provider: &dyn LlmProvider,
...  |
20 | |     token: CancellationToken,
21 | | ) {
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments
   = note: `-D clippy::too-many-arguments` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::too_many_arguments)]`

error: you should consider adding a `Default` implementation for `HookRegistry`
  --> src\agent\hooks.rs:25:5
   |
25 | /     pub fn new() -> Self {
26 | |         Self { hooks: vec![] }
27 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
   = note: `-D clippy::new-without-default` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::new_without_default)]`
help: try adding this
   |
24 + impl Default for HookRegistry {
25 +     fn default() -> Self {
26 +         Self::new()
27 +     }
28 + }
   |

error: this `impl` can be derived
  --> src\agent\instance.rs:14:1
   |
14 | / impl Default for AgentStatus {
15 | |     fn default() -> Self {
16 | |         AgentStatus::Active
17 | |     }
18 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
   = note: `-D clippy::derivable-impls` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::derivable_impls)]`
help: replace the manual implementation with a derive attribute and mark the default variant
   |
 7 + #[derive(Default)]
 8 | pub enum AgentStatus {
 9 ~     #[default]
10 ~     Active,
   |

error: method `add` can be confused for the standard trait method `std::ops::Add::add`
  --> src\agent\middleware.rs:54:5
   |
54 | /     pub fn add(mut self, mw: Box<dyn ContextMiddleware>) -> Self {
55 | |         self.steps.push(mw);
56 | |         self.sort();
57 | |         self
58 | |     }
   | |_____^
   |
   = help: consider implementing the trait `std::ops::Add` or choosing a less ambiguous method name
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#should_implement_trait
   = note: `-D clippy::should-implement-trait` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::should_implement_trait)]`

error: this function has too many arguments (9/7)
  --> src\agent\orchestrator\execution.rs:18:5
   |
18 | /     pub(crate) async fn execute_task_with_agent(
19 | |         &self,
20 | |         provider: &dyn LlmProvider,
21 | |         model: &str,
...  |
27 | |         token: CancellationToken,
28 | |     ) -> Result<AgentResponse> {
   | |______________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (9/7)
   --> src\agent\orchestrator\execution.rs:275:5
    |
275 | /     pub(crate) async fn synthesize_results(
276 | |         &self,
277 | |         provider: &dyn LlmProvider,
278 | |         model: &str,
...   |
284 | |         chat_id: &str,
285 | |     ) -> Result<AgentResponse> {
    | |______________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (9/7)
  --> src\agent\orchestrator\loop.rs:24:5
   |
24 | /     pub async fn run_orchestrator_loop(
25 | |         &self,
26 | |         provider: Arc<dyn LlmProvider>,
27 | |         model: &str,
...  |
33 | |         approval_rx: Option<tokio::sync::oneshot::Receiver<bool>>,
34 | |     ) -> Result<AgentResponse> {
   | |______________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: very complex type used. Consider factoring parts into `type` definitions
   --> src\agent\plugins.rs:167:14
    |
167 |     plugins: RwLock<HashMap<String, Arc<RwLock<Box<dyn Plugin>>>>>,
    |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#type_complexity
    = note: `-D clippy::type-complexity` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::type_complexity)]`

error: use of `or_insert_with` to construct default value
   --> src\agent\plugins.rs:321:60
    |
321 |         let handlers = ext_points.entry(point.to_string()).or_insert_with(Vec::new);
    |                                                            ^^^^^^^^^^^^^^^^^^^^^^^^ help: try: `or_default()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unwrap_or_default
    = note: `-D clippy::unwrap-or-default` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unwrap_or_default)]`

error: consider using `sort_by_key`
   --> src\agent\plugins.rs:323:9
    |
323 |         handlers.sort_by(|a, b| b.priority.cmp(&a.priority));
    |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_sort_by
    = note: `-D clippy::unnecessary-sort-by` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unnecessary_sort_by)]`
help: try
    |
323 -         handlers.sort_by(|a, b| b.priority.cmp(&a.priority));
323 +         handlers.sort_by_key(|b| std::cmp::Reverse(b.priority));
    |

error: use of `or_insert_with` to construct default value
   --> src\agent\plugins.rs:476:45
    |
476 |         ext_points.entry(point.to_string()).or_insert_with(Vec::new);
    |                                             ^^^^^^^^^^^^^^^^^^^^^^^^ help: try: `or_default()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unwrap_or_default

error: unnecessary use of `to_string`
   --> src\agent\router.rs:347:33
    |
347 |                 tokens.contains(&keyword.to_string())
    |                                 ^^^^^^^^^^^^^^^^^^^^ help: replace it with: `keyword`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_to_owned
    = note: `-D clippy::unnecessary-to-owned` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unnecessary_to_owned)]`

error: unnecessary use of `to_string`
   --> src\agent\router.rs:361:33
    |
361 |                 tokens.contains(&keyword.to_string())
    |                                 ^^^^^^^^^^^^^^^^^^^^ help: replace it with: `keyword`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_to_owned

error: unnecessary use of `to_string`
   --> src\agent\router.rs:376:33
    |
376 |                 tokens.contains(&keyword.to_string())
    |                                 ^^^^^^^^^^^^^^^^^^^^ help: replace it with: `keyword`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_to_owned

error: casting to the same type is unnecessary (`usize` -> `usize`)
   --> src\agent\router.rs:624:40
    |
624 |     let complexity_multiplier = 1000 * complexity as usize;
    |                                        ^^^^^^^^^^^^^^^^^^^ help: try: `complexity`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_cast
    = note: `-D clippy::unnecessary-cast` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unnecessary_cast)]`

error: this function has too many arguments (10/7)
  --> src\agent\runner\actions.rs:26:1
   |
26 | / pub async fn persist_and_emit_action(
27 | |     app: &AppHandle,
28 | |     db_pool: &SqlitePool,
29 | |     chat_id: &str,
...  |
36 | |     channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
37 | | ) -> Result<String> {
   | |___________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
   --> src\agent\runner\actions.rs:126:1
    |
126 | / fn bridge_lifecycle_events(
127 | |     app: &AppHandle,
128 | |     channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
129 | |     kind: &MessageKind,
...   |
134 | |     content: String,
135 | | ) {
    | |_^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
   --> src\agent\runner\background.rs:248:1
    |
248 | / async fn perform_background_compaction(
249 | |     app: AppHandle,
250 | |     db: SqlitePool,
251 | |     chat_id: String,
...   |
256 | |     summarization_token_budget: usize,
257 | | ) -> Result<()> {
    | |_______________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (13/7)
   --> src\agent\runner\escalation.rs:193:5
    |
193 | /     pub(super) async fn call_llm_with_escalation(
194 | |         &self,
195 | |         provider: &dyn crate::llm::LlmProvider,
196 | |         model: &str,
...   |
206 | |         agent_stream: Option<(String, String)>,
207 | |     ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
    | |_______________________________________________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: useless conversion to the same type: `anyhow::Error`
   --> src\agent\runner\escalation.rs:373:41
    |
373 | ...                   Err(e.into())
    |                           ^^^^^^^^ help: consider removing `.into()`: `e`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion
    = note: `-D clippy::useless-conversion` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::useless_conversion)]`

error: useless conversion to the same type: `anyhow::Error`
   --> src\agent\runner\escalation.rs:391:33
    |
391 | ...                   Err(e.into())
    |                           ^^^^^^^^ help: consider removing `.into()`: `e`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `anyhow::Error`
   --> src\agent\runner\escalation.rs:403:25
    |
403 |                     Err(e.into())
    |                         ^^^^^^^^ help: consider removing `.into()`: `e`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: this function has too many arguments (12/7)
   --> src\agent\runner\escalation.rs:410:5
    |
410 | /     pub(super) async fn call_llm_with_callback(
411 | |         &self,
412 | |         provider: &dyn crate::llm::LlmProvider,
413 | |         model: &str,
...   |
422 | |         agent_stream: Option<(String, String)>,
423 | |     ) -> Result<crate::db::models::ChatResponse, anyhow::Error> {
    | |_______________________________________________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: writing `&mut Vec` instead of `&mut [_]` involves a new object where a slice will do
  --> src\agent\runner\helpers.rs:81:43
   |
81 | pub fn compact_conversation(conversation: &mut Vec<ChatMessage>, keep_recent: usize) {
   |                                           ^^^^^^^^^^^^^^^^^^^^^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#ptr_arg
   = note: `-D clippy::ptr-arg` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::ptr_arg)]`
help: change this to
   |
81 - pub fn compact_conversation(conversation: &mut Vec<ChatMessage>, keep_recent: usize) {
81 + pub fn compact_conversation(conversation: &mut [ChatMessage], keep_recent: usize) {
   |

error: this `if` statement can be collapsed
   --> src\agent\runner\helpers.rs:118:13
    |
118 | /             if conversation[i].tool_calls.is_some() && conversation[i].role == "assistant" {
119 | |                 if i + 1 < removable_end && conversation[i + 1].role == "tool" {
120 | |                     conversation.remove(i);
121 | |                     conversation.remove(i);
...   |
126 | |             }
    | |_____________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#collapsible_if
    = note: `-D clippy::collapsible-if` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::collapsible_if)]`
help: collapse nested if block
    |
118 ~             if conversation[i].tool_calls.is_some() && conversation[i].role == "assistant"
119 ~                 && i + 1 < removable_end && conversation[i + 1].role == "tool" {
120 |                     conversation.remove(i);
...
124 |                     break;
125 ~                 }
    |

error: this function has too many arguments (8/7)
  --> src\agent\runner\loop.rs:45:5
   |
45 | /     pub async fn run(
46 | |         &self,
47 | |         provider: &dyn LlmProvider,
48 | |         chat_id: String,
...  |
53 | |         token: CancellationToken,
54 | |     ) -> Result<crate::agent::types::AgentResponse, anyhow::Error> {
   | |__________________________________________________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: explicit call to `.into_iter()` in function argument accepting `IntoIterator`
   --> src\agent\runner\loop.rs:721:22
    |
721 |                 .zip(remaining_results.into_iter())
    |                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
note: this parameter accepts any `IntoIterator`, so you don't need to call `.into_iter()`
   --> /rustc/ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96/library\core\src\iter\traits\iterator.rs:634:11
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion
help: consider removing the `.into_iter()`
    |
721 -                 .zip(remaining_results.into_iter())
721 +                 .zip(remaining_results)
    |

error: this let-binding has unit value
   --> src\agent\runner\loop.rs:769:29
    |
769 | / ...                   let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
770 | | ...                       message: format!("Transferring to {}", next_agent.name),
771 | | ...                       chat_id: chat_id.clone(),
772 | | ...                       iteration: Some(iteration),
...   |
778 | | ...                       })),
779 | | ...                   }));
    | |__________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#let_unit_value
    = note: `-D clippy::let-unit-value` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::let_unit_value)]`
help: omit the `let` binding
    |
769 -                             let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
769 +                             self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
    |

error: this function has too many arguments (9/7)
  --> src\agent\runner\tool_actions.rs:8:1
   |
 8 | / pub(super) async fn emit_tool_call_action(
 9 | |     app: &AppHandle,
10 | |     db_pool: Option<&SqlitePool>,
11 | |     channel: &Option<tauri::ipc::Channel<Value>>,
...  |
17 | |     depth: u32,
18 | | ) {
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (10/7)
  --> src\agent\runner\tool_actions.rs:66:1
   |
66 | / pub(super) async fn emit_cached_tool_result_action(
67 | |     app: &AppHandle,
68 | |     db_pool: Option<&SqlitePool>,
69 | |     channel: &Option<tauri::ipc::Channel<Value>>,
...  |
76 | |     depth: u32,
77 | | ) {
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
  --> src\agent\runner\tool_dispatch.rs:71:5
   |
71 | /     pub(super) async fn execute_tools_with_hooks(
72 | |         &self,
73 | |         tool_calls: &[ToolCall],
74 | |         chat_id: &str,
...  |
79 | |         token: CancellationToken,
80 | |     ) -> Vec<ToolResult> {
   | |________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this let-binding has unit value
   --> src\agent\runner\tool_dispatch.rs:142:13
    |
142 | /             let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
143 | |                 message: format!("Executing: {}", tool_call.name),
144 | |                 chat_id: chat_id.to_string(),
145 | |                 iteration: Some(iteration),
...   |
156 | |                 })),
157 | |             }));
    | |________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#let_unit_value
help: omit the `let` binding
    |
142 -             let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
142 +             self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
    |

error: the borrowed expression implements the required traits
   --> src\agent\runner\tool_dispatch.rs:373:76
    |
373 | ...                   format!("{}:{:x}", tc_name, Sha256::digest(&tc_args.to_string()));
    |                                                                  ^^^^^^^^^^^^^^^^^^^^ help: change this to: `tc_args.to_string()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args
    = note: `-D clippy::needless-borrows-for-generic-args` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::needless_borrows_for_generic_args)]`

error: this let-binding has unit value
   --> src\agent\runner\tool_dispatch.rs:421:33
    |
421 | / ...                   let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
422 | | ...                       message: format!("Awaiting approval: {}", v2_tool_call.name),
423 | | ...                       chat_id: chat_id.to_string(),
424 | | ...                       iteration: Some(iteration),
...   |
435 | | ...                       })),
436 | | ...                   }));
    | |__________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#let_unit_value
help: omit the `let` binding
    |
421 -                                 let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
421 +                                 self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
    |

error: this function has too many arguments (8/7)
   --> src\agent\runner\tool_pipeline.rs:205:1
    |
205 | / pub(super) fn normalize_tool_result(
206 | |     tool_call_id: String,
207 | |     tool_id: &str,
208 | |     display_name: &str,
...   |
213 | |     started_at: chrono::DateTime<chrono::Utc>,
214 | | ) -> ToolResult {
    | |_______________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this manual char comparison can be written more succinctly
   --> src\agent\runner\voice_display.rs:395:45
    |
395 |         .map(|token| token.trim_end_matches(|ch: char| matches!(ch, '.' | ';' | '}')).to_string())
    |                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: consider using an array of `char`: `['.', ';', '}']`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_pattern_char_comparison
    = note: `-D clippy::manual-pattern-char-comparison` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::manual_pattern_char_comparison)]`

error: this `if` can be collapsed into the outer `match`
   --> src\agent\runner\voice_display.rs:473:13
    |
473 | /             if !object.contains_key("id") {
474 | |                 if let Some(block_id) = object
475 | |                     .get("block")
476 | |                     .and_then(|b| b.get("id"))
...   |
483 | |             }
    | |_____________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#collapsible_match
    = note: `-D clippy::collapsible-match` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::collapsible_match)]`
help: collapse nested if block
    |
472 ~         "update" | "remove" | "focus"
473 ~             if !object.contains_key("id") => {
474 |                 if let Some(block_id) = object
...
482 |                 }
483 ~             }
    |

error: this `if` has identical blocks
   --> src\agent\runner\voice_display.rs:613:47
    |
613 |           } else if object.contains_key("body") {
    |  _______________________________________________^
614 | |             Some("note")
615 | |         } else {
    | |_________^
    |
note: same as this
   --> src\agent\runner\voice_display.rs:615:16
    |
615 |           } else {
    |  ________________^
616 | |             Some("note")
617 | |         };
    | |_________^
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#if_same_then_else
    = note: `-D clippy::if-same-then-else` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::if_same_then_else)]`

error: this `map_or` can be simplified
   --> src\agent\runner\voice_display.rs:640:28
    |
640 |       let content_is_empty = object
    |  ____________________________^
641 | |         .get("content")
642 | |         .and_then(|content| content.as_str())
643 | |         .map_or(true, |content| content.trim().is_empty());
    | |__________________________________________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_map_or
    = note: `-D clippy::unnecessary-map-or` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unnecessary_map_or)]`
help: use `is_none_or` instead
    |
643 -         .map_or(true, |content| content.trim().is_empty());
643 +         .is_none_or(|content| content.trim().is_empty());
    |

error: this `impl` can be derived
  --> src\agent\task.rs:25:1
   |
25 | / impl Default for TaskPriority {
26 | |     fn default() -> Self {
27 | |         TaskPriority::Medium
28 | |     }
29 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
help: replace the manual implementation with a derive attribute and mark the default variant
   |
18 + #[derive(Default)]
19 | pub enum TaskPriority {
20 |     Critical = 0,
21 |     High = 1,
22 ~     #[default]
23 ~     Medium = 2,
   |

error: this `impl` can be derived
  --> src\agent\task.rs:41:1
   |
41 | / impl Default for TaskStatus {
42 | |     fn default() -> Self {
43 | |         TaskStatus::Pending
44 | |     }
45 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
help: replace the manual implementation with a derive attribute and mark the default variant
   |
33 + #[derive(Default)]
34 | pub enum TaskStatus {
35 ~     #[default]
36 ~     Pending,
   |

error: this `impl` can be derived
  --> src\agent\task.rs:66:1
   |
66 | / impl Default for TaskType {
67 | |     fn default() -> Self {
68 | |         TaskType::ToolCall
69 | |     }
70 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
help: replace the manual implementation with a derive attribute and mark the default variant
   |
58 + #[derive(Default)]
59 | pub enum TaskType {
60 ~     #[default]
61 ~     ToolCall,
   |

error: consider using `sort_by_key`
   --> src\agent\task.rs:178:9
    |
178 |         tasks.sort_by(|a, b| a.priority.cmp(&b.priority));
    |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_sort_by
help: try
    |
178 -         tasks.sort_by(|a, b| a.priority.cmp(&b.priority));
178 +         tasks.sort_by_key(|a| a.priority);
    |

error: consider using `sort_by_key`
   --> src\agent\task_queue.rs:191:9
    |
191 |         tasks.sort_by(|a, b| a.task.priority.cmp(&b.task.priority));
    |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_sort_by
help: try
    |
191 -         tasks.sort_by(|a, b| a.task.priority.cmp(&b.task.priority));
191 +         tasks.sort_by_key(|a| a.task.priority);
    |

error: called `Iterator::last` on a `DoubleEndedIterator`; this will needlessly iterate the entire iterator
   --> src\agent\task_queue.rs:294:35
    |
294 |             if let Some(record) = self.history.iter().filter(|r| r.task_id == task_id).last() {
    |                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#double_ended_iterator_last
    = note: `-D clippy::double-ended-iterator-last` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::double_ended_iterator_last)]`
help: try
    |
294 -             if let Some(record) = self.history.iter().filter(|r| r.task_id == task_id).last() {
294 +             if let Some(record) = self.history.iter().filter(|r| r.task_id == task_id).next_back() {
    |

error: implementation of inherent method `to_string(&self) -> String` for type `agent::task_queue::TaskQueueSummary`
   --> src\agent\task_queue.rs:400:5
    |
400 | /     pub fn to_string(&self) -> String {
401 | |         format!(
402 | |             "Tasks: {} total | {} pending | {} in progress | {} completed | {} failed ({:.1}% complete)",
403 | |             self.total,
...   |
410 | |     }
    | |_____^
    |
    = help: implement trait `Display` for type `agent::task_queue::TaskQueueSummary` instead
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#inherent_to_string
    = note: `-D clippy::inherent-to-string` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::inherent_to_string)]`

error: unnecessary closure used to substitute value for `Option::None`
  --> src\agent\tools\child_runner.rs:74:36
   |
74 |       let effective_context_window = config_file
   |  ____________________________________^
75 | |         .as_ref()
76 | |         .filter(|c| c.context_window > 0)
77 | |         .map(|c| c.context_window as usize)
78 | |         .or_else(|| agent.context_window);
   | |_________________________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_lazy_evaluations
   = note: `-D clippy::unnecessary-lazy-evaluations` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::unnecessary_lazy_evaluations)]`
help: use `or` instead
   |
78 -         .or_else(|| agent.context_window);
78 +         .or(agent.context_window);
   |

error: this function has too many arguments (8/7)
   --> src\agent\tools\child_runner.rs:176:1
    |
176 | / pub(crate) fn build_child_runner(
177 | |     app: &AppHandle,
178 | |     tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
179 | |     agent_registry: Arc<AgentRegistry>,
...   |
184 | |     allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
185 | | ) -> Result<Runner> {
    | |___________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: stripping a prefix manually
  --> src\agent\tools\drawing_tools.rs:56:19
   |
56 |         let hex = &s[1..];
   |                   ^^^^^^^
   |
note: the prefix was tested here
  --> src\agent\tools\drawing_tools.rs:55:5
   |
55 |     if s.starts_with('#') {
   |     ^^^^^^^^^^^^^^^^^^^^^^
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_strip
   = note: `-D clippy::manual-strip` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::manual_strip)]`
help: try using the `strip_prefix` method
   |
55 ~     if let Some(hex) = s.strip_prefix('#') {
56 ~         let valid = matches!(hex.len(), 3 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
   |

error: manual implementation of `.is_multiple_of()`
   --> src\agent\tools\drawing_tools.rs:239:38
    |
239 |                 if args.len() < 4 || args.len() % 2 != 0 {
    |                                      ^^^^^^^^^^^^^^^^^^^ help: replace with: `!args.len().is_multiple_of(2)`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_is_multiple_of
    = note: `-D clippy::manual-is-multiple-of` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::manual_is_multiple_of)]`

error: manual implementation of `.is_multiple_of()`
   --> src\agent\tools\drawing_tools.rs:258:38
    |
258 |                 if args.len() < 4 || args.len() % 2 != 0 {
    |                                      ^^^^^^^^^^^^^^^^^^^ help: replace with: `!args.len().is_multiple_of(2)`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_is_multiple_of

error: you should consider adding a `Default` implementation for `ManageBoardTool`
   --> src\agent\tools\manage_board.rs:151:5
    |
151 | /     pub fn new() -> Self {
152 | |         Self
153 | |     }
    | |_____^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
    |
150 + impl Default for ManageBoardTool {
151 +     fn default() -> Self {
152 +         Self::new()
153 +     }
154 + }
    |

error: this `if` can be collapsed into the outer `match`
   --> src\agent\tools\manage_board.rs:249:13
    |
249 | /             if block.markup.as_deref().map_or(true, str::is_empty) {
250 | |                 anyhow::bail!("SVG blocks require markup");
251 | |             }
    | |_____________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#collapsible_match
help: collapse nested if block
    |
248 ~         BoardBlockKind::Svg
249 ~             if block.markup.as_deref().map_or(true, str::is_empty) => {
250 |                 anyhow::bail!("SVG blocks require markup");
251 ~             }
    |

error: this `map_or` can be simplified
   --> src\agent\tools\manage_board.rs:234:16
    |
234 |             if block.url.as_deref().map_or(true, str::is_empty) {
    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_map_or
help: use `is_none_or` instead
    |
234 -             if block.url.as_deref().map_or(true, str::is_empty) {
234 +             if block.url.as_deref().is_none_or(str::is_empty) {
    |

error: this `map_or` can be simplified
   --> src\agent\tools\manage_board.rs:239:16
    |
239 |             if block.content.as_deref().map_or(true, str::is_empty) {
    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_map_or
help: use `is_none_or` instead
    |
239 -             if block.content.as_deref().map_or(true, str::is_empty) {
239 +             if block.content.as_deref().is_none_or(str::is_empty) {
    |

error: this `map_or` can be simplified
   --> src\agent\tools\manage_board.rs:244:16
    |
244 |             if block.card_type.as_deref().map_or(true, str::is_empty) || block.card_data.is_none() {
    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_map_or
help: use `is_none_or` instead
    |
244 -             if block.card_type.as_deref().map_or(true, str::is_empty) || block.card_data.is_none() {
244 +             if block.card_type.as_deref().is_none_or(str::is_empty) || block.card_data.is_none() {
    |

error: this `map_or` can be simplified
   --> src\agent\tools\manage_board.rs:249:16
    |
249 |             if block.markup.as_deref().map_or(true, str::is_empty) {
    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_map_or
help: use `is_none_or` instead
    |
249 -             if block.markup.as_deref().map_or(true, str::is_empty) {
249 +             if block.markup.as_deref().is_none_or(str::is_empty) {
    |

error: you should consider adding a `Default` implementation for `MapTool`
  --> src\agent\tools\map_tools.rs:11:5
   |
11 | /     pub fn new() -> Self {
12 | |         Self
13 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
10 + impl Default for MapTool {
11 +     fn default() -> Self {
12 +         Self::new()
13 +     }
14 + }
   |

error: this `impl` can be derived
  --> src\agent\tools\progressive.rs:26:1
   |
26 | / impl Default for DetailLevel {
27 | |     fn default() -> Self {
28 | |         DetailLevel::Minimal
29 | |     }
30 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
help: replace the manual implementation with a derive attribute and mark the default variant
   |
20 + #[derive(Default)]
21 | pub enum DetailLevel {
22 ~     #[default]
23 ~     Minimal,
   |

error: this function has too many arguments (12/7)
  --> src\agent\tools\spawn_tools.rs:53:5
   |
53 | /     pub(crate) async fn do_spawn(
54 | |         &self,
55 | |         app: AppHandle,
56 | |         chat_id: String,
...  |
65 | |         label: &str,
66 | |     ) -> Result<Value> {
   | |______________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (11/7)
   --> src\agent\tools\spawn_tools.rs:425:1
    |
425 | / fn emit_completion_events(
426 | |     app: &AppHandle,
427 | |     chat_id: &str,
428 | |     agent_id: &str,
...   |
436 | |     duration_ms: u64,
437 | | ) -> Result<()> {
    | |_______________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: you should consider adding a `Default` implementation for `ToolRegistry`
  --> src\agent\tools\mod.rs:55:5
   |
55 | /     pub fn new() -> Self {
56 | |         Self {
57 | |             tools: HashMap::new(),
58 | |             progressive: None,
59 | |         }
60 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
54 + impl Default for ToolRegistry {
55 +     fn default() -> Self {
56 +         Self::new()
57 +     }
58 + }
   |

error: this `impl` can be derived
  --> src\agent\types.rs:41:1
   |
41 | / impl Default for ModelTier {
42 | |     fn default() -> Self {
43 | |         ModelTier::Local
44 | |     }
45 | | }
   | |_^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#derivable_impls
help: replace the manual implementation with a derive attribute and mark the default variant
   |
32 + #[derive(Default)]
33 | pub enum ModelTier {
34 |     /// Simple tasks - can use lightweight models or Agent Booster (no LLM)
35 |     Simple,
36 |     /// Local models (Ollama, LM Studio) - free, offline, but may be less capable
37 ~     #[default]
38 ~     Local,
   |

error: you should consider adding a `Default` implementation for `AgentRegistry`
  --> src\agent\types.rs:62:5
   |
62 | /     pub fn new() -> Self {
63 | |         Self {
64 | |             agents: HashMap::new(),
65 | |         }
66 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
61 + impl Default for AgentRegistry {
62 +     fn default() -> Self {
63 +         Self::new()
64 +     }
65 + }
   |

error: implementation of inherent method `to_string(&self) -> String` for type `canvas::anchors::AnchorType`
  --> src\canvas\anchors.rs:38:5
   |
38 | /     pub fn to_string(&self) -> String {
39 | |         match self {
40 | |             AnchorType::Canvas(point) => format!("canvas.{}", point),
41 | |             AnchorType::Object { object_id, point } => format!("{}.{}", object_id, point),
42 | |         }
43 | |     }
   | |_____^
   |
   = help: implement trait `Display` for type `canvas::anchors::AnchorType` instead
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#inherent_to_string

error: returning the result of a `let` binding from a block
   --> src\canvas\planning.rs:105:5
    |
 99 | /     let final_pos = if let Some([dx, dy]) = hint.offset {
100 | |         [adjusted[0] + dx as f64, adjusted[1] + dy as f64]
101 | |     } else {
102 | |         adjusted
103 | |     };
    | |______- unnecessary `let` binding
104 |
105 |       final_pos
    |       ^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#let_and_return
    = note: `-D clippy::let-and-return` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::let_and_return)]`
help: return the expression directly
    |
 99 ~     
100 |
101 ~     if let Some([dx, dy]) = hint.offset {
102 +         [adjusted[0] + dx as f64, adjusted[1] + dy as f64]
103 +     } else {
104 +         adjusted
105 +     }
    |

error: the loop variable `i` is only used to index `points`
   --> src\canvas\plot.rs:255:14
    |
255 |     for i in 1..points.len() {
    |              ^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_range_loop
    = note: `-D clippy::needless-range-loop` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::needless_range_loop)]`
help: consider using an iterator
    |
255 -     for i in 1..points.len() {
255 +     for <item> in points.iter().skip(1) {
    |

error: writing `&mut Vec` instead of `&mut [_]` involves a new object where a slice will do
   --> src\canvas\validator.rs:143:33
    |
143 | pub fn auto_fix_layout(objects: &mut Vec<(String, [f64; 4])>, canvas: [u32; 2]) -> Vec<String> {
    |                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#ptr_arg
help: change this to
    |
143 - pub fn auto_fix_layout(objects: &mut Vec<(String, [f64; 4])>, canvas: [u32; 2]) -> Vec<String> {
143 + pub fn auto_fix_layout(objects: &mut [(String, [f64; 4])], canvas: [u32; 2]) -> Vec<String> {
    |

error: useless conversion to the same type: `std::string::String`
  --> src\commands\agent_config.rs:71:53
   |
71 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))
   |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
  --> src\commands\agent_config.rs:83:53
   |
83 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))
   |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
  --> src\commands\agent_config.rs:93:53
   |
93 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))
   |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
   --> src\commands\agent_config.rs:102:53
    |
102 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))?;
    |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
   --> src\commands\agent_config.rs:121:53
    |
121 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))
    |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
   --> src\commands\agent_config.rs:133:53
    |
133 |         .map_err(|e| crate::error::ZenError::Custom(e.to_string().into()))
    |                                                     ^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `e.to_string()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless use of `format!`
  --> src\commands\audio.rs:84:50
   |
84 |                 .map_err(|e2| ZenError::Internal(format!("{e2}")))
   |                                                  ^^^^^^^^^^^^^^^ help: consider using `.to_string()`: `e2.to_string()`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_format
   = note: `-D clippy::useless-format` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(clippy::useless_format)]`

error: this function has too many arguments (24/7)
   --> src\commands\chat.rs:110:1
    |
110 | / pub async fn send_message(
111 | |     app: AppHandle,
112 | |     state: State<'_, AppState>,
113 | |     chat_id: String,
...   |
134 | |     voice_display_context: Option<String>,
135 | | ) -> ZenResult<()> {
    | |__________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: field assignment outside of initializer for an instance created with Default::default()
   --> src\commands\chat.rs:250:5
    |
250 |     config.temperature = temperature;
    |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
note: consider initializing the variable with `llm::ChatRequestConfig { temperature: temperature, max_tokens: max_tokens, top_p: top_p, top_k: top_k, presence_penalty: presence_penalty, frequency_penalty: frequency_penalty, repeat_penalty: repeat_penalty, seed: seed, stop: stop, ..Default::default() }` and removing relevant reassignments
   --> src\commands\chat.rs:249:5
    |
249 |     let mut config = ChatRequestConfig::default();
    |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#field_reassign_with_default
    = note: `-D clippy::field-reassign-with-default` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::field_reassign_with_default)]`

error: this function has too many arguments (13/7)
   --> src\commands\spatial.rs:394:1
    |
394 | / pub async fn save_geofence_db(
395 | |     state: State<'_, AppState>,
396 | |     id: String,
397 | |     name: String,
...   |
407 | |     alert_enabled: bool,
408 | | ) -> Result<(), ZenError> {
    | |_________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (10/7)
   --> src\commands\spatial.rs:459:1
    |
459 | / pub async fn save_marker_db(
460 | |     state: State<'_, AppState>,
461 | |     id: String,
462 | |     name: String,
...   |
469 | |     metadata: Option<String>,
470 | | ) -> Result<(), ZenError> {
    | |_________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: consider using `sort_by_key`
  --> src\commands\system.rs:86:5
   |
86 |     dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_sort_by
help: try
   |
86 -     dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
86 +     dirs.sort_by_key(|a| a.name.to_lowercase());
   |

error: consider using `sort_by_key`
  --> src\commands\system.rs:87:5
   |
87 |     entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_sort_by
help: try
   |
87 -     entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
87 +     entries.sort_by_key(|a| a.name.to_lowercase());
   |

error: redundant closure
  --> src\commands\voice.rs:48:18
   |
48 |         .map_err(|e| ZenError::Internal(e))
   |                  ^^^^^^^^^^^^^^^^^^^^^^^^^ help: replace the closure with the tuple variant itself: `ZenError::Internal`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#redundant_closure

error: you seem to be trying to use `match` for destructuring a single pattern. Consider using `if let`
   --> src\commands\voice.rs:124:17
    |
124 | /                 match vad.is_voice_segment(chunk) {
125 | |                     Ok(is_voice) => {
126 | |                         if is_voice {
127 | |                             voiced_frames += 1;
...   |
136 | |                     Err(_) => {}
137 | |                 }
    | |_________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#single_match
    = note: `-D clippy::single-match` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::single_match)]`
help: try
    |
124 ~                 if let Ok(is_voice) = vad.is_voice_segment(chunk) {
125 +                     if is_voice {
126 +                         voiced_frames += 1;
127 +                         consecutive_voiced += 1;
128 +                         if consecutive_voiced > max_consecutive_voiced {
129 +                             max_consecutive_voiced = consecutive_voiced;
130 +                         }
131 +                     } else {
132 +                         consecutive_voiced = 0;
133 +                     }
134 +                 }
    |

error: redundant closure
   --> src\commands\voice.rs:180:18
    |
180 |         .map_err(|e| ZenError::Internal(e))?;
    |                  ^^^^^^^^^^^^^^^^^^^^^^^^^ help: replace the closure with the tuple variant itself: `ZenError::Internal`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#redundant_closure

error: redundant closure
   --> src\commands\voice.rs:311:22
    |
311 |             .map_err(|e| ZenError::Internal(e))?;
    |                      ^^^^^^^^^^^^^^^^^^^^^^^^^ help: replace the closure with the tuple variant itself: `ZenError::Internal`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#redundant_closure

error: unnecessary `if let` since only the `Ok` variant of the iterator element is used
   --> src\commands\voice.rs:369:9
    |
369 | /         for entry in entries {
370 | |             if let Ok(entry) = entry {
371 | |                 let path = entry.path();
372 | |                 if path.extension().map(|e| e == "onnx").unwrap_or(false) {
...   |
386 | |         }
    | |_________^
    |
help: try `.flatten()` and remove the `if let` statement in the for loop
   --> src\commands\voice.rs:370:13
    |
370 | /             if let Ok(entry) = entry {
371 | |                 let path = entry.path();
372 | |                 if path.extension().map(|e| e == "onnx").unwrap_or(false) {
373 | |                     let name = path
...   |
385 | |             }
    | |_____________^
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_flatten
    = note: `-D clippy::manual-flatten` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::manual_flatten)]`
help: try
    |
369 ~         for entry in entries.flatten() {
370 +             let path = entry.path();
371 +             if path.extension().map(|e| e == "onnx").unwrap_or(false) {
372 +                 let name = path
373 +                     .file_stem()
374 +                     .map(|s| s.to_string_lossy().to_string())
375 +                     .unwrap_or_else(|| "Unknown".to_string());
376 + 
377 +                 voices.push(VoiceModel {
378 +                     id: name.clone(),
379 +                     name,
380 +                     path: path.to_string_lossy().to_string(),
381 +                     is_default: false,
382 +                 });
383 +             }
384 +         }
    |

error: you should consider adding a `Default` implementation for `AgentState`
  --> src\commands\mod.rs:82:5
   |
82 | /     pub fn new() -> Self {
83 | |         Self {
84 | |             event_bus: Arc::new(EventBus::default()),
85 | |         }
86 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
81 + impl Default for AgentState {
82 +     fn default() -> Self {
83 +         Self::new()
84 +     }
85 + }
   |

error: you should consider adding a `Default` implementation for `SysInfoState`
   --> src\commands\mod.rs:97:5
    |
 97 | /     pub fn new() -> Self {
 98 | |         Self {
 99 | |             system: RwLock::new(sysinfo::System::new_all()),
100 | |             networks: RwLock::new(sysinfo::Networks::new_with_refreshed_list()),
...   |
104 | |     }
    | |_____^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
    |
 96 + impl Default for SysInfoState {
 97 +     fn default() -> Self {
 98 +         Self::new()
 99 +     }
100 + }
    |

error: very complex type used. Consider factoring parts into `type` definitions
   --> src\commands\mod.rs:152:9
    |
152 |         Arc<tokio::sync::Mutex<HashMap<String, (Arc<dyn LlmProvider>, std::time::Instant)>>>,
    |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#type_complexity

error: you should consider adding a `Default` implementation for `AppState`
   --> src\commands\mod.rs:157:5
    |
157 | /     pub fn new() -> Self {
158 | |         let progressive = Arc::new(RwLock::new(
159 | |             crate::agent::tools::progressive::ProgressiveToolRegistry::new(),
160 | |         ));
...   |
293 | |     }
    | |_____^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
    |
156 + impl Default for AppState {
157 +     fn default() -> Self {
158 +         Self::new()
159 +     }
160 + }
    |

error: this `if` statement can be collapsed
   --> src\commands\mod.rs:186:13
    |
186 | /             if path.exists() && path.is_dir() {
187 | |                 if agent_registry_inner.load_from_dir(&path) > 0 {
188 | |                     break;
189 | |                 }
190 | |             }
    | |_____________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#collapsible_if
help: collapse nested if block
    |
186 ~             if path.exists() && path.is_dir()
187 ~                 && agent_registry_inner.load_from_dir(&path) > 0 {
188 |                     break;
189 ~                 }
    |

error: you are needlessly cloning iterator elements
   --> src\commands\mod.rs:296:28
    |
296 |         self.db.get().await.map(|p| p.clone())
    |                            ^^^^^^^^^^^^^^^^^^^ help: remove the `map` call
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#map_clone
    = note: `-D clippy::map-clone` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::map_clone)]`

error: you are needlessly cloning iterator elements
   --> src\commands\mod.rs:300:29
    |
300 |         self.rag.get().await.map(|r| r.clone())
    |                             ^^^^^^^^^^^^^^^^^^^ help: remove the `map` call
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#map_clone

error: useless conversion to the same type: `std::string::String`
   --> src\commands\mod.rs:328:43
    |
328 |             .map_err(|e| ZenError::Custom(format!("Invalid workspace root: {}", e).into()))?;
    |                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `format!("Invalid workspace root: {}", e)`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: useless conversion to the same type: `std::string::String`
   --> src\commands\mod.rs:354:43
    |
354 |             .map_err(|e| ZenError::Custom(format!("RAG search failed: {}", e).into()))
    |                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: consider removing `.into()`: `format!("RAG search failed: {}", e)`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion

error: this function has too many arguments (9/7)
   --> src\db\queries\artifacts.rs:134:1
    |
134 | / pub async fn update_message(
135 | |     pool: &SqlitePool,
136 | |     id: &str,
137 | |     chat_id: &str,
...   |
143 | |     reasoning_details: Option<&str>,
144 | | ) -> ZenResult<()> {
    | |__________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this expression creates a reference which is immediately dereferenced by the compiler
   --> src\db\queries\artifacts.rs:177:72
    |
177 |                         serde_json::from_str::<Vec<serde_json::Value>>(&prev_str)
    |                                                                        ^^^^^^^^^ help: change this to: `prev_str`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrow
    = note: `-D clippy::needless-borrow` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::needless_borrow)]`

error: this function has too many arguments (8/7)
  --> src\db\queries\documents.rs:10:1
   |
10 | / pub async fn add_document(
11 | |     pool: &SqlitePool,
12 | |     id: &str,
13 | |     filename: &str,
...  |
18 | |     mime_type: &str,
19 | | ) -> ZenResult<crate::db::models::Document> {
   | |___________________________________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (10/7)
  --> src\db\queries\graphs.rs:44:1
   |
44 | / pub async fn save_graph_session(
45 | |     pool: &SqlitePool,
46 | |     session_id: &str,
47 | |     expressions_json: &str,
...  |
54 | |     history_json: &str,
55 | | ) -> ZenResult<()> {
   | |__________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:51:11
   |
51 |     .bind(&geofence.center_lat)
   |           ^^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.center_lat`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:52:11
   |
52 |     .bind(&geofence.center_lon)
   |           ^^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.center_lon`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:53:11
   |
53 |     .bind(&geofence.radius_km)
   |           ^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.radius_km`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:55:11
   |
55 |     .bind(&geofence.box_north)
   |           ^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.box_north`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:56:11
   |
56 |     .bind(&geofence.box_south)
   |           ^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.box_south`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:57:11
   |
57 |     .bind(&geofence.box_east)
   |           ^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.box_east`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:58:11
   |
58 |     .bind(&geofence.box_west)
   |           ^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.box_west`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
  --> src\db\queries\gtsm.rs:59:11
   |
59 |     .bind(&geofence.alert_enabled)
   |           ^^^^^^^^^^^^^^^^^^^^^^^ help: change this to: `geofence.alert_enabled`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
   --> src\db\queries\gtsm.rs:110:11
    |
110 |     .bind(&marker.lat)
    |           ^^^^^^^^^^^ help: change this to: `marker.lat`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
   --> src\db\queries\gtsm.rs:111:11
    |
111 |     .bind(&marker.lon)
    |           ^^^^^^^^^^^ help: change this to: `marker.lon`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: the borrowed expression implements the required traits
   --> src\db\queries\gtsm.rs:112:11
    |
112 |     .bind(&marker.alt)
    |           ^^^^^^^^^^^ help: change this to: `marker.alt`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrows_for_generic_args

error: this function has too many arguments (16/7)
  --> src\db\queries\message.rs:8:1
   |
 8 | / pub async fn add_message(
 9 | |     pool: &SqlitePool,
10 | |     chat_id: &str,
11 | |     id: Option<&str>,
...  |
24 | |     reasoning_details: Option<&str>,
25 | | ) -> ZenResult<Message> {
   | |_______________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
  --> src\db\queries\session_memory.rs:44:1
   |
44 | / pub async fn add_session_memory(
45 | |     pool: &SqlitePool,
46 | |     id: &str,
47 | |     session_id: &str,
...  |
52 | |     embedding: &[u8],
53 | | ) -> ZenResult<()> {
   | |__________________^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: accessing first element with `m.loaded_instances.get(0)`
   --> src\llm\lmstudio\models.rs:123:35
    |
123 |                 let max_context = m.loaded_instances.get(0).and_then(|i| i.context_length);
    |                                   ^^^^^^^^^^^^^^^^^^^^^^^^^ help: try: `m.loaded_instances.first()`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#get_first
    = note: `-D clippy::get-first` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::get_first)]`

error: this `.filter_map(..)` can be written more simply using `.map(..)`
   --> src\llm\ollama.rs:229:30
    |
229 |   ...                   .filter_map(|url| {
    |  ________________________^
230 | | ...                       // Ollama expects raw base64, so strip data URL prefix if present
231 | | ...                       if let Some(comma_pos) = url.find(',') {
232 | | ...                           Some(url[comma_pos + 1..].to_string())
...   |
236 | | ...                   })
    | |________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unnecessary_filter_map
    = note: `-D clippy::unnecessary-filter-map` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::unnecessary_filter_map)]`

error: this expression creates a reference which is immediately dereferenced by the compiler
   --> src\rag\hybrid_backend.rs:117:58
    |
117 |             let stored_embedding = deserialize_embedding(&embedding_blob);
    |                                                          ^^^^^^^^^^^^^^^ help: change this to: `embedding_blob`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrow

error: this expression creates a reference which is immediately dereferenced by the compiler
   --> src\rag\hybrid_backend.rs:206:58
    |
206 |             let stored_embedding = deserialize_embedding(&embedding_blob);
    |                                                          ^^^^^^^^^^^^^^^ help: change this to: `embedding_blob`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrow

error: manual implementation of `.is_multiple_of()`
   --> src\rag\hybrid_backend.rs:285:8
    |
285 |     if blob.len() % 4 != 0 {
    |        ^^^^^^^^^^^^^^^^^^^ help: replace with: `!blob.len().is_multiple_of(4)`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_is_multiple_of

error: clamp-like pattern without using clamp function
   --> src\rag\hybrid_backend.rs:306:5
    |
306 |     similarity.max(-1.0).min(1.0)
    |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: replace with clamp: `similarity.clamp(-1.0, 1.0)`
    |
    = note: clamp will panic if max < min, min.is_nan(), or max.is_nan()
    = note: clamp returns NaN if the input is NaN
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#manual_clamp
    = note: `-D clippy::manual-clamp` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::manual_clamp)]`

error: called `Iterator::last` on a `DoubleEndedIterator`; this will needlessly iterate the entire iterator
   --> src\rag\ingestion.rs:116:34
    |
116 |                     "file_type": source_path.split('.').last().unwrap_or_default(),
    |                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#double_ended_iterator_last
help: try
    |
116 -                     "file_type": source_path.split('.').last().unwrap_or_default(),
116 +                     "file_type": source_path.split('.').next_back().unwrap_or_default(),
    |

error: explicit call to `.into_iter()` in function argument accepting `IntoIterator`
  --> src\rag\lancedb_store.rs:90:55
   |
90 |         for (chunk, vector) in chunks.into_iter().zip(embeddings.into_iter()) {
   |                                                       ^^^^^^^^^^^^^^^^^^^^^^
   |
note: this parameter accepts any `IntoIterator`, so you don't need to call `.into_iter()`
  --> /rustc/ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96/library\core\src\iter\traits\iterator.rs:634:11
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_conversion
help: consider removing the `.into_iter()`
   |
90 -         for (chunk, vector) in chunks.into_iter().zip(embeddings.into_iter()) {
90 +         for (chunk, vector) in chunks.into_iter().zip(embeddings) {
   |

error: you should consider adding a `Default` implementation for `DocumentService`
  --> src\services\document.rs:20:5
   |
20 | /     pub fn new() -> Self {
21 | |         Self {
22 | |             db_pool: Arc::new(RwLock::new(None)),
23 | |             rag_store: Arc::new(RwLock::new(None)),
...  |
27 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
19 + impl Default for DocumentService {
20 +     fn default() -> Self {
21 +         Self::new()
22 +     }
23 + }
   |

error: you should consider adding a `Default` implementation for `GtsmCache`
  --> src\services\gtsm\cache.rs:31:5
   |
31 | /     pub fn new() -> Self {
32 | |         Self {
33 | |             satellites: RwLock::new(None),
34 | |             flights: RwLock::new(None),
...  |
43 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
30 + impl Default for GtsmCache {
31 +     fn default() -> Self {
32 +         Self::new()
33 +     }
34 + }
   |

error: you should consider adding a `Default` implementation for `GeofenceEngine`
  --> src\services\gtsm\geofence.rs:12:5
   |
12 | /     pub fn new() -> Self {
13 | |         Self {
14 | |             zones: RwLock::new(HashMap::new()),
15 | |             inside: RwLock::new(HashMap::new()),
16 | |         }
17 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
11 + impl Default for GeofenceEngine {
12 +     fn default() -> Self {
13 +         Self::new()
14 +     }
15 + }
   |

error: this expression creates a reference which is immediately dereferenced by the compiler
   --> src\services\gtsm\satellites.rs:110:57
    |
110 |         if let Ok(constants) = Constants::from_elements(&elements) {
    |                                                         ^^^^^^^^^ help: change this to: `elements`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#needless_borrow

error: you should consider adding a `Default` implementation for `HardwareService`
  --> src\services\hardware.rs:45:5
   |
45 | /     pub fn new() -> Self {
46 | |         let has_cuda = detect_cuda_driver();
47 | |
48 | |         Self {
...  |
56 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
44 + impl Default for HardwareService {
45 +     fn default() -> Self {
46 +         Self::new()
47 +     }
48 + }
   |

error: you should consider adding a `Default` implementation for `SettingsService`
  --> src\services\settings.rs:14:5
   |
14 | /     pub fn new() -> Self {
15 | |         Self {
16 | |             cache: Arc::new(RwLock::new(HashMap::new())),
17 | |             db_pool: Arc::new(RwLock::new(None)),
18 | |         }
19 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
13 + impl Default for SettingsService {
14 +     fn default() -> Self {
15 +         Self::new()
16 +     }
17 + }
   |

error: you should consider adding a `Default` implementation for `TerminalService`
  --> src\services\terminal.rs:25:5
   |
25 | /     pub fn new() -> Self {
26 | |         Self {
27 | |             sessions: Arc::new(Mutex::new(Vec::new())),
28 | |         }
29 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
24 + impl Default for TerminalService {
25 +     fn default() -> Self {
26 +         Self::new()
27 +     }
28 + }
   |

error: this function has too many arguments (8/7)
   --> src\services\terminal.rs:107:5
    |
107 | /     pub async fn spawn_interactive(
108 | |         &self,
109 | |         manager: &RwLock<TerminalManager>,
110 | |         security: &SecurityService,
...   |
115 | |         cwd: Option<String>,
116 | |     ) -> ZenResult<String> {
    | |__________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
   --> src\services\tool.rs:377:5
    |
377 | /     pub async fn execute_agent_tool(
378 | |         &self,
379 | |         tool: Option<Arc<dyn crate::agent::tools::AgentTool>>,
380 | |         app: AppHandle,
...   |
385 | |         allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
386 | |     ) -> crate::agent::types::ToolResult {
    | |________________________________________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: this function has too many arguments (8/7)
   --> src\services\tool.rs:762:5
    |
762 | /     async fn audit_execution_result(
763 | |         &self,
764 | |         caller: &str,
765 | |         resolved_name: &str,
...   |
770 | |         error: Option<&str>,
771 | |     ) {
    | |_____^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#too_many_arguments

error: you should consider adding a `Default` implementation for `TerminalManager`
  --> src\terminal\mod.rs:67:5
   |
67 | /     pub fn new() -> Self {
68 | |         Self {
69 | |             sessions: HashMap::new(),
70 | |             process_manager: None,
71 | |         }
72 | |     }
   | |_____^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
   |
66 + impl Default for TerminalManager {
67 +     fn default() -> Self {
68 +         Self::new()
69 +     }
70 + }
   |

error: very complex type used. Consider factoring parts into `type` definitions
  --> src\terminal\mod.rs:91:20
   |
91 |         on_output: Option<Box<dyn Fn(&str, &str) + Send + 'static>>,
   |                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#type_complexity

error: very complex type used. Consider factoring parts into `type` definitions
   --> src\terminal\mod.rs:113:20
    |
113 |         on_output: Option<Box<dyn Fn(&str, &str) + Send + 'static>>,
    |                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#type_complexity

error: use of `or_insert_with` to construct default value
  --> src\tools\manager.rs:65:14
   |
65 |             .or_insert_with(ToolPermissionRules::default);
   |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: try: `or_default()`
   |
   = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#unwrap_or_default

error: you should consider adding a `Default` implementation for `ToolRegistry`
   --> src\tools\mod.rs:170:5
    |
170 | /     pub fn new() -> Self {
171 | |         Self {
172 | |             tools: HashMap::new(),
173 | |             legacy_tools: HashMap::new(),
...   |
179 | |     }
    | |_____^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#new_without_default
help: try adding this
    |
169 + impl Default for ToolRegistry {
170 +     fn default() -> Self {
171 +         Self::new()
172 +     }
173 + }
    |

error: this let-binding has unit value
   --> src\lib.rs:26:5
    |
 26 | /     let _builder = tauri::Builder::default()
 27 | |         .plugin(tauri_plugin_opener::init())
 28 | |         .plugin(tauri_plugin_notification::init())
 29 | |         .plugin(tauri_plugin_dialog::init())
...   |
382 | |             std::process::exit(1);
383 | |         });
    | |___________^
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#let_unit_value
help: omit the `let` binding
    |
 26 -     let _builder = tauri::Builder::default()
 26 +     tauri::Builder::default()
    |

error: useless use of `vec!`
   --> src\agent\task.rs:359:19
    |
359 |         let ids = vec![t1.id.clone(), t2.id.clone(), t3.id.clone()];
    |                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ help: you can use an array directly: `[t1.id.clone(), t2.id.clone(), t3.id.clone()]`
    |
    = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#useless_vec
    = note: `-D clippy::useless-vec` implied by `-D warnings`
    = help: to override `-D warnings` add `#[allow(clippy::useless_vec)]`

error: could not compile `zen` (lib) due to 139 previous errors
warning: build failed, waiting for other jobs to finish...
error: could not compile `zen` (lib test) due to 140 previous errors
Error: Process completed with exit code 1.
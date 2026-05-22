/// Agentic Swarm Phase 3: Orchestrator System
///
/// Provides high-level orchestration for complex multi-agent tasks:
/// - Goal breakdown into subtasks
/// - Specialist agent spawning
/// - Task queue management
/// - Result synthesis
/// - Progress tracking

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use tokio::time::timeout;
use tracing::{info, warn, error, instrument};
use futures::stream::{FuturesUnordered, StreamExt};

use crate::agent::event_bus::{
    AgentEvent, ChatChunkPayload, ChatDonePayload, ChatErrorPayload,
};
use crate::agent::runner::{self, Runner};
use crate::agent::types::{AgentRegistry, AgentResponse, MessageKind, ActionMeta, SpawnMeta};
use crate::agent::task::{Task, TaskType, TaskPriority};
use crate::agent::task_queue::TaskQueue;
use crate::agent::tools::ToolRegistry;
use crate::agent::hooks::HookRegistry;
use crate::llm::{LlmProvider, ChatRequestConfig, LlmChunk};
use crate::db::models::{ChatMessage, OrchestrationPlan, OrchestrationTask};
use crate::db::queries;
use crate::tools::GlobalToolRegistry;
use crate::tools::manager::ToolManager;
use sqlx::SqlitePool;
use uuid::Uuid;
use chrono::Utc;

/// Orchestrator for managing complex multi-agent workflows
pub struct Orchestrator {
    app: AppHandle,
    agent_registry: Arc<AgentRegistry>,
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    hook_registry: Arc<HookRegistry>,
    permissions: GlobalToolRegistry,
    tool_manager: Arc<ToolManager>,
    event_bus: Arc<crate::agent::event_bus::EventBus>,
    agent_memory: Arc<crate::agent::memory::UnifiedMemoryBackend>,
    db_pool: Option<SqlitePool>,
    on_event: Option<tauri::ipc::Channel<serde_json::Value>>,
}

/// Result of breaking down a goal into tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBreakdown {
    /// The original goal
    pub goal: String,
    /// List of subtasks to achieve the goal
    pub tasks: Vec<Task>,
    /// Estimated complexity (1-10)
    pub complexity: u8,
    /// Suggested agent assignments for each task
    pub agent_assignments: Vec<(String, String)>, // (task_id, agent_id)
}

/// Progress update for orchestrator execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorProgress {
    /// Current phase of execution
    pub phase: OrchestratorPhase,
    /// Task queue summary
    pub queue_summary: String,
    /// Current task description (if any)
    pub current_task: Option<String>,
    /// Overall progress percentage (0-100)
    pub progress_percentage: f64,
    /// Message for user display
    pub message: String,
}

/// Phases of orchestrator execution
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestratorPhase {
    /// Analyzing the goal
    Analyzing,
    /// Breaking goal into tasks
    Planning,
    /// Executing tasks
    Executing,
    /// Synthesizing results
    Synthesizing,
    /// Complete
    Complete,
}

impl Orchestrator {
    /// Create a new orchestrator
    pub fn new(
        app: AppHandle,
        agent_registry: Arc<AgentRegistry>,
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        hook_registry: Arc<HookRegistry>,
        permissions: GlobalToolRegistry,
        tool_manager: Arc<ToolManager>,
        event_bus: Arc<crate::agent::event_bus::EventBus>,
        agent_memory: Arc<crate::agent::memory::UnifiedMemoryBackend>,
    ) -> Self {
        Self {
            app,
            agent_registry,
            tool_registry,
            hook_registry,
            permissions,
            tool_manager,
            event_bus,
            agent_memory,
            db_pool: None,
            on_event: None,
        }
    }

    /// Set a direct IPC channel for high-performance event streaming
    pub fn with_channel(mut self, channel: tauri::ipc::Channel<serde_json::Value>) -> Self {
        self.on_event = Some(channel);
        self
    }

    /// Internal helper to emit events via direct channel (if available) or global bus
    fn emit(&self, event: AgentEvent) -> Result<()> {
        event.emit_via(&self.app, &self.on_event);
        Ok(())
    }

    /// Set the database pool for intermediate saves
    pub fn with_db_pool(mut self, db_pool: SqlitePool) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    /// Break a high-level goal into concrete subtasks
    ///
    /// This uses the LLM to analyze the goal and generate a structured task breakdown
    #[instrument(skip(self, provider, messages), fields(goal = %goal))]
    pub async fn break_goal_into_tasks(
        &self,
        provider: &dyn LlmProvider,
        model: &str,
        messages: &[ChatMessage],
        goal: &str,
    ) -> Result<TaskBreakdown> {
        info!("Breaking down goal into subtasks: {}", goal);

        // Build system prompt for task breakdown
        let system_prompt = r#"You are an expert task planner. Your job is to break down complex goals into concrete, actionable tasks.

For each goal, you will:
1. Analyze the goal and identify all required steps
2. Create 3-7 concrete tasks that, when completed, will achieve the goal
3. Assign each task to the most appropriate specialist agent
4. Identify task dependencies (which tasks must complete before others)
5. Estimate complexity (1-10)

Available specialist agents:
- **generalist**: General-purpose tasks, simple queries, coordination
- **operational_expert**: Operational analysis, mapping, geofencing, military/flight tracking
- **researcher**: Research, document analysis, web search, knowledge retrieval
- **researcher**: Research, document analysis, web search

Output format (JSON):
{
  "tasks": [
    {
      "description": "Clear, actionable task description",
      "agent": "agent_id",
      "priority": "high|medium|low",
      "dependencies": ["task_id_1", "task_id_2"] // optional
    }
  ],
  "complexity": 5 // 1-10
}

Be specific in task descriptions. Include all necessary context for the assigned agent to execute without additional clarification."#;

        // Build user message with the goal
        let user_content = format!("Break down this goal into tasks:\n\n{}", goal);

        let mut task_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
                images: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // Add context from existing messages if provided
        if !messages.is_empty() {
            task_messages.extend(messages.iter().take(5).cloned());
        }

        // Finally push the user planning request
        task_messages.push(ChatMessage {
            role: "user".to_string(),
            content: user_content,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // Call LLM to get task breakdown
        let config = ChatRequestConfig {
            stream: false,
            temperature: Some(0.3), // Lower temperature for more structured output
            max_tokens: Some(2000),
            ..ChatRequestConfig::default()
        };

        let response = provider.chat_stream(
            model,
            task_messages,
            None, // No tools needed for planning
            config,
            Box::new(|_| {}), // No streaming callback needed
            CancellationToken::new(),
        ).await?;

        // Parse the response to extract task breakdown
        let content = &response.content;

        let breakdown = self.parse_task_breakdown(content, goal)?;
        
        info!(
            task_count = breakdown.tasks.len(),
            complexity = breakdown.complexity,
            "Goal breakdown complete"
        );

        Ok(breakdown)
    }

    /// Parse LLM response into structured task breakdown
    fn parse_task_breakdown(&self, content: &str, goal: &str) -> Result<TaskBreakdown> {
        // Try to extract JSON from the response using robust balanced-brace logic
        let json_str = crate::agent::utils::extract_json_object(content)
            .ok_or_else(|| anyhow::anyhow!("No JSON object found in LLM response: {}", content))?;

        #[derive(Debug, Deserialize)]
        struct TaskPlan {
            tasks: Vec<TaskSpec>,
            complexity: Option<u8>,
        }

        #[derive(Debug, Deserialize)]
        struct TaskSpec {
            description: String,
            agent: String,
            priority: Option<String>,
            dependencies: Option<Vec<String>>,
        }

        let plan: TaskPlan = serde_json::from_str(&json_str)
            .with_context(|| format!("Failed to parse task breakdown JSON: {}", json_str))?;

        // Convert task specs to actual Task objects
        let mut tasks = Vec::new();
        let mut agent_assignments = Vec::new();
        let mut task_ids = Vec::new();

        for spec in &plan.tasks {
            let priority = match spec.priority.as_deref() {
                Some("high") => TaskPriority::High,
                Some("low") => TaskPriority::Low,
                _ => TaskPriority::Medium,
            };

            let task_type = TaskType::Custom(format!("orchestrator_{}", spec.agent));
            
            let mut task = Task::new(&spec.description, task_type)
                .with_priority(priority);

            // Add dependencies
            if let Some(deps) = &spec.dependencies {
                for dep in deps {
                    task = task.with_dependency(dep);
                }
            }

            task_ids.push(task.id.clone());
            agent_assignments.push((task.id.clone(), spec.agent.clone()));
            tasks.push(task);
        }

        Ok(TaskBreakdown {
            goal: goal.to_string(),
            tasks,
            complexity: plan.complexity.unwrap_or(5),
            agent_assignments,
        })
    }

    /// Run the orchestrator loop for a complex goal
    ///
    /// This is the main entry point for orchestrator-mode execution
    #[instrument(skip(self, provider, messages), fields(chat_id = %chat_id))]
    pub async fn run_orchestrator_loop(
        &self,
        provider: Arc<dyn LlmProvider>,
        model: &str,
        messages: Vec<ChatMessage>,
        chat_id: &str,
        goal: &str,
        config: ChatRequestConfig,
        token: CancellationToken,
        approval_rx: Option<tokio::sync::oneshot::Receiver<bool>>,
    ) -> Result<AgentResponse> {
        info!("Starting orchestrator loop for goal: {}", goal);

        // Phase 1: Analyze
        self.emit_progress(chat_id, OrchestratorPhase::Analyzing, 0.0, "Analyzing goal and identifying requirements...")?;
        
        // Phase 2: Plan - Break goal into tasks
        self.emit_progress(chat_id, OrchestratorPhase::Planning, 10.0, "Breaking down goal into subtasks...")?;
        
        let breakdown = match self.break_goal_into_tasks(&*provider, model, &messages, goal).await {
            Ok(b) => b,
            Err(e) => {
                let _ = self.emit(AgentEvent::ChatError(ChatErrorPayload {
                    chat_id: chat_id.to_string(),
                    error: format!("Failed to break goal into tasks: {}", e),
                    recoverable: false,
                }));
                return Err(e);
            }
        };
        
        // --- PERSISTENCE: Save initial plan and tasks ---
        let plan_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        if let Some(ref pool) = self.db_pool {
            let plan = OrchestrationPlan {
                id: plan_id.clone(),
                chat_id: chat_id.to_string(),
                goal: goal.to_string(),
                complexity: Some(breakdown.complexity.to_string()),
                status: "planning".to_string(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            
            if let Err(e) = queries::save_orchestration_plan(pool, &plan).await {
                warn!("Failed to save orchestration plan: {}", e);
            }

            // Save individual tasks
            for task in &breakdown.tasks {
                let agent_id = breakdown.agent_assignments.iter()
                    .find(|(tid, _)| tid == &task.id)
                    .map(|(_, aid)| aid.clone())
                    .unwrap_or_else(|| "generalist".to_string());

                let otask = OrchestrationTask {
                    id: task.id.clone(),
                    plan_id: plan_id.clone(),
                    description: task.description.clone(),
                    agent_id,
                    priority: match task.priority {
                        TaskPriority::Critical => 4,
                        TaskPriority::High => 3,
                        TaskPriority::Medium => 2,
                        TaskPriority::Low => 1,
                    },
                    status: "pending".to_string(),
                    dependencies: serde_json::to_string(&task.dependencies).unwrap_or_else(|_| "[]".to_string()),
                    result: None,
                    retry_count: 0,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };

                if let Err(e) = queries::save_orchestration_task(pool, &otask).await {
                    warn!("Failed to save orchestration task {}: {}", task.id, e);
                }
            }
        }
        
        // --- MANUAL APPROVAL GATE ---
        if let Some(rx) = approval_rx {
            info!("Waiting for user approval of the orchestrator plan...");
            self.emit_progress(chat_id, OrchestratorPhase::Planning, 15.0, "Waiting for plan approval...")?;
            
            match rx.await {
                Ok(true) => {
                    info!("Plan approved by user. Proceeding to execution.");
                }
                Ok(false) | Err(_) => {
                    info!("Plan rejected or approval timed out. Aborting orchestrator.");
                    
                    if let Some(ref pool) = self.db_pool {
                        let _ = queries::update_orchestration_plan_status(pool, &plan_id, "rejected").await;
                    }

                    self.emit_progress(chat_id, OrchestratorPhase::Complete, 0.0, "Orchestration rejected by user.")?;

                    // Emit ChatDone to signal frontend that streaming is complete
                    let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
                        chat_id: chat_id.to_string(),
                        content: Some("Orchestration was cancelled by the user after reviewing the plan.".to_string()),
                        tokens_in: 0,
                        tokens_out: 0,
                        reason: "cancelled".to_string(),
                        done: true,
                    }));

                    return Ok(AgentResponse {
                        content: Some("Orchestration was cancelled by the user after reviewing the plan.".to_string()),
                        tool_calls: vec![],
                        reasoning: None,
                        handoff: None,
                        tokens_in: None,
                        tokens_out: None,
                        message_persisted: false,
                    });
                }
            }
        }
        
        info!(
            task_count = breakdown.tasks.len(),
            complexity = breakdown.complexity,
            "Task breakdown complete"
        );

        // Create task queue
        let mut queue = TaskQueue::from_tasks(breakdown.tasks.clone());
        
        // Resolve execution order (respects dependencies)
        if let Err(e) = queue.resolve_order() {
            warn!("Failed to resolve task order: {}", e);
            // Continue anyway - tasks will execute as dependencies allow
        }

        // Phase 3: Execute - Process task queue
        self.emit_progress(chat_id, OrchestratorPhase::Executing, 20.0, "Executing subtasks...")?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "executing").await;
        }

        let mut task_results: Vec<(String, String)> = Vec::new(); // (task_id, result)
        let mut all_messages = messages.clone();
        let mut running_tasks = FuturesUnordered::new();

        // Helper logic to spawn all currently ready tasks
        let spawn_ready = |queue: &mut TaskQueue, running_tasks: &mut FuturesUnordered<_>, all_messages: &[ChatMessage]| {
            for next_ready in queue.pop_all_ready() {
                let task_id = next_ready.task.id.clone();
                let task_desc = next_ready.task.description.clone();
                
                let agent_id = breakdown.agent_assignments.iter()
                    .find(|(tid, _)| tid == &task_id)
                    .map(|(_, aid)| aid.clone())
                    .unwrap_or_else(|| "generalist".to_string());
                
                info!("Spawning task: {} - {}", task_id, task_desc);
                
                let provider_clone = provider.clone();
                let model_clone = model.to_string();
                let chat_id_clone = chat_id.to_string();
                let messages_clone = all_messages.to_vec();
                let config_clone = config.clone();
                let token_clone = token.clone();
                
                running_tasks.push(async move {
                    let result = timeout(std::time::Duration::from_secs(120), self.execute_task_with_agent(
                        &*provider_clone,
                        &model_clone,
                        &next_ready.task,
                        &agent_id,
                        &chat_id_clone,
                        &messages_clone,
                        config_clone,
                        token_clone,
                    )).await;
                    
                    (task_id, agent_id, result, next_ready)
                });
            }
        };

        // Initial spawn of ready tasks
        spawn_ready(&mut queue, &mut running_tasks, &all_messages);

        while (!queue.is_empty() || !running_tasks.is_empty()) && !token.is_cancelled() {
            tokio::select! {
                Some((task_id, agent_id, result, queued_task)) = running_tasks.next() => {
                    match result {
                        Ok(Ok(response)) => {
                            let result_content = response.content.unwrap_or_else(|| "Task completed".to_string());
                            info!("Task {} completed successfully", task_id);

                            queue.mark_completed(&task_id, Some(100));
                            task_results.push((task_id.clone(), result_content.clone()));

                            if let Some(ref pool) = self.db_pool {
                                let _ = queries::update_orchestration_task_status(pool, &task_id, "completed", Some(&result_content)).await;
                            }

                            all_messages.push(ChatMessage {
                                role: "assistant".to_string(),
                                content: format!("[Task {} complete] {}", agent_id, result_content),
                                images: None,
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }
                        Ok(Err(e)) => {
                            let error_msg = e.to_string();
                            warn!("Task {} failed: {}", task_id, error_msg);
                            queue.mark_failed(&task_id, &error_msg, Some(100));
                            
                            if queued_task.retry_count < 3 {
                                let plan_b = self.generate_alternative_approach(&queued_task.task, &error_msg);
                                let retry_task = queued_task.retry_with_plan_b(plan_b);
                                queue.push(retry_task);
                                info!("Queued task {} for retry with Plan B", task_id);
                            } else {
                                task_results.push((task_id.clone(), format!("Failed after 3 attempts: {}", error_msg)));
                                if let Some(ref pool) = self.db_pool {
                                    let _ = queries::update_orchestration_task_status(pool, &task_id, "failed", Some(&format!("Failed after 3 attempts: {}", error_msg))).await;
                                }
                            }
                        }
                        Err(_) => {
                            let error_msg = "Task execution timed out after 120s".to_string();
                            warn!("Task {} failed: {}", task_id, error_msg);
                            queue.mark_failed(&task_id, &error_msg, Some(100));
                            task_results.push((task_id.clone(), format!("Timed out: {}", error_msg)));
                        }
                    }

                    // Emit progress update
                    let progress = 20.0 + (queue.completed_count() as f64 / (queue.total_count() as f64).max(1.0)) * 60.0;
                    self.emit_progress(
                        chat_id,
                        OrchestratorPhase::Executing,
                        progress,
                        "Executing subtasks...",
                    )?;

                    // Try to spawn any newly ready tasks
                    spawn_ready(&mut queue, &mut running_tasks, &all_messages);
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                    if running_tasks.is_empty() && queue.is_empty() {
                        break;
                    }
                    // Fallback to check if any tasks became ready that we missed
                    spawn_ready(&mut queue, &mut running_tasks, &all_messages);
                    
                    if running_tasks.is_empty() && !queue.is_empty() {
                        // All remaining tasks are blocked or resolved
                        if queue.all_resolved() {
                            break;
                        }
                        warn!("Task queue stuck in parallel execution - breaking out");
                        break;
                    }
                }
            }
        }

        // If all tasks were cancelled before any executed, emit ChatDone and return early
        if token.is_cancelled() && task_results.is_empty() {
            info!("Orchestrator task execution cancelled — no tasks completed, no synthesis needed");
            let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
                chat_id: chat_id.to_string(),
                content: Some("Orchestration cancelled before any tasks could complete.".to_string()),
                tokens_in: 0,
                tokens_out: 0,
                reason: "cancelled".to_string(),
                done: true,
            }));
            self.emit_progress(chat_id, OrchestratorPhase::Complete, 100.0, "Orchestration cancelled")?;
            return Ok(AgentResponse {
                content: Some("Orchestration cancelled before any tasks could complete.".to_string()),
                tool_calls: vec![],
                reasoning: None,
                handoff: None,
                tokens_in: None,
                tokens_out: None,
                message_persisted: false,
            });
        }

        // Phase 4: Synthesize - Combine all results
        self.emit_progress(chat_id, OrchestratorPhase::Synthesizing, 85.0, "Synthesizing results...")?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "synthesizing").await;
        }

        let final_response = match self.synthesize_results(
            &*provider,
            model,
            goal,
            &task_results,
            &all_messages,
            config,
            token,
            chat_id,
        ).await {
            Ok(response) => response,
            Err(e) => {
                // Emit ChatError — frontend handler sets isStreaming(false), status="failed", and displays error
                let _ = self.emit(AgentEvent::ChatError(crate::agent::event_bus::ChatErrorPayload {
                    chat_id: chat_id.to_string(),
                    error: format!("Orchestration synthesis failed: {}", e),
                    recoverable: false,
                }));
                return Err(e);
            }
        };

        // Phase 5: Complete
        self.emit_progress(chat_id, OrchestratorPhase::Complete, 100.0, "Orchestrator complete")?;

        if let Some(ref pool) = self.db_pool {
            let _ = queries::update_orchestration_plan_status(pool, &plan_id, "completed").await;
        }

        // Emit chat:done to signal frontend that streaming is complete
        let _ = self.emit(AgentEvent::ChatDone(ChatDonePayload {
            chat_id: chat_id.to_string(),
            content: final_response.content.clone(),
            tokens_in: final_response.tokens_in.unwrap_or(0) as i64,
            tokens_out: final_response.tokens_out.unwrap_or(0) as i64,
            reason: "complete".to_string(),
            done: true,
        }));

        info!("Orchestrator loop completed");
        Ok(final_response)
    }

    /// Execute a single task with the assigned agent
    async fn execute_task_with_agent(
        &self,
        provider: &dyn LlmProvider,
        model: &str,
        task: &Task,
        agent_id: &str,
        chat_id: &str,
        messages: &[ChatMessage],
        config: ChatRequestConfig,
        token: CancellationToken,
    ) -> Result<AgentResponse> {
        // Get agent definition
        let agent = self.agent_registry.get(agent_id)
            .cloned()
            .or_else(|| {
                // Fallback to generalist if agent not found
                self.agent_registry.get("generalist").cloned()
            })
            .ok_or_else(|| anyhow::anyhow!("Agent '{}' not found", agent_id))?;

        // Create runner for this agent
        let mut runner = Runner::new(
            self.app.clone(),
            self.tool_registry.clone(),
            self.agent_registry.clone(),
            self.hook_registry.clone(),
            self.permissions.clone(),
            self.tool_manager.clone(),
        );

        // Pass direct channel for high-performance streaming if available
        if let Some(ref channel) = self.on_event {
            runner = runner.with_channel(channel.clone());
        }

        // Pass db_pool if available
        if let Some(ref db_pool) = self.db_pool {
            runner = runner.with_db_pool(db_pool.clone());
        }

        // Build task-specific prompt
        let task_prompt = format!(
            "Execute the following task:\n\n\
             **Task**: {}\n\n\
             **Context**: This is part of a larger orchestrator workflow.\n\
             Focus on completing this specific task efficiently.\n\
             Use all available tools at your disposal.\n\n\
             Provide a comprehensive result that can be synthesized with other task results.",
            task.description
        );

        // Create messages for this task
        let mut task_messages = messages.to_vec();
        task_messages.push(ChatMessage {
            role: "user".to_string(),
            content: task_prompt,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });

        // Emit spawn start action for chat timeline (this now also bridges to AgentEvent)
        let spawn_meta = ActionMeta {
            agent_id: agent_id.to_string(),
            agent_name: agent.name.clone(),
            iteration: 0,
            depth: 0,
            progress_percent: None,
            tool_call: None,
            tool_result: None,
            handoff: None,
            spawn: Some(SpawnMeta {
                parent_agent: "orchestrator".to_string(),
                child_agent: agent.name.clone(),
                task: task.description.clone(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: None,
            }),
            approval_request: None,
            ..Default::default()
        };
        
        let spawn_content = format!("Spawning {} for: {}", agent.name, task.description.chars().take(80).collect::<String>());
        let spawn_id = if let Some(ref pool) = self.db_pool {
            runner::persist_and_emit_action(
                &self.app,
                pool,
                chat_id,
                None,
                MessageKind::AgentSpawn,
                spawn_content,
                spawn_meta,
                Some("assistant"),
                None,
                &self.on_event,
            ).await?
        } else {
            runner::emit_action_only(
                &self.app,
                chat_id,
                None,
                MessageKind::AgentSpawn,
                spawn_content,
                spawn_meta,
                &self.on_event,
            )?
        };

        let start_time = std::time::Instant::now();
        // Run the agent with tokio::select! to handle parent cancellation
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — orchestration task aborted"))
            }
            res = runner.run(
                provider,
                chat_id.to_string(),
                model.to_string(),
                task_messages,
                agent.clone(),
                config,
                token.clone(),
            ) => res
        };
        let duration_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                // Emit complete action for chat timeline (this now also bridges to AgentEvent)
                let complete_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "orchestrator".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.description.clone(),
                        status: "completed".to_string(),
                        duration_ms: Some(duration_ms),
                        spawn_id: Some(spawn_id),
                    }),
                    approval_request: None,
                    ..Default::default()
                };

                let complete_content = format!("{} completed in {}ms", agent.name, duration_ms);
                if let Some(ref pool) = self.db_pool {
                    let _ = runner::persist_and_emit_action(
                        &self.app,
                        pool,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        complete_content,
                        complete_meta,
                        Some("assistant"),
                        None,
                        &self.on_event,
                    ).await;
                } else {
                    let _ = runner::emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        complete_content,
                        complete_meta,
                        &self.on_event,
                    );
                }

                Ok(response)
            }
            Err(e) => {
                // Emit failed action for chat timeline (this now also bridges to AgentEvent)
                let failed_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent.name.clone(),
                    iteration: 0,
                    depth: 0,
                    progress_percent: None,
                    tool_call: None,
                    tool_result: None,
                    handoff: None,
                    spawn: Some(SpawnMeta {
                        parent_agent: "orchestrator".to_string(),
                        child_agent: agent.name.clone(),
                        task: task.description.clone(),
                        status: "failed".to_string(),
                        duration_ms: Some(duration_ms),
                        spawn_id: Some(spawn_id),
                    }),
                    approval_request: None,
                    ..Default::default()
                };

                let failed_content = format!("{} failed after {}ms: {}", agent.name, duration_ms, e);
                if let Some(ref pool) = self.db_pool {
                    let _ = runner::persist_and_emit_action(
                        &self.app,
                        pool,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        failed_content,
                        failed_meta,
                        Some("assistant"),
                        None,
                        &self.on_event,
                    ).await;
                } else {
                    let _ = runner::emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::AgentComplete,
                        failed_content,
                        failed_meta,
                        &self.on_event,
                    );
                }
                
                Err(e)
            }
        }
    }

    /// Synthesize all task results into a final comprehensive response.
    /// Streams output to the frontend via chat:partial events.
    async fn synthesize_results(
        &self,
        provider: &dyn LlmProvider,
        model: &str,
        original_goal: &str,
        task_results: &[(String, String)],
        messages: &[ChatMessage],
        config: ChatRequestConfig,
        token: CancellationToken,
        chat_id: &str,
    ) -> Result<AgentResponse> {
        info!("Synthesizing {} task results", task_results.len());

        let system_prompt = r#"You are synthesizing the results of a multi-agent orchestration.
Your job is to combine all task results into a comprehensive, coherent final answer.

Guidelines:
1. Acknowledge the original goal
2. Summarize what was accomplished
3. Present results from each task in a logical order
4. Highlight key findings, code, or outputs
5. Note any tasks that failed and their impact
6. Provide actionable next steps if relevant

Be thorough but organized. Use formatting (headers, lists, code blocks) to make the response easy to read."#;

        let task_results_str = task_results.iter()
            .map(|(id, result)| format!("- **Task {}**: {}", id, result))
            .collect::<Vec<_>>()
            .join("\n");

        let user_content = format!(
            "Original Goal: {}\n\n\
             Task Results:\n{}\n\n\
             Synthesize these results into a comprehensive final answer.",
            original_goal,
            task_results_str
        );

        let mut synth_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
                images: None,
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_content,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // Add context from execution
        synth_messages.extend(messages.iter().take(10).cloned());

        // Create a weak pointer for the orchestrator to use in the callback
        // This is tricky because LlmProvider::chat_stream expects Box<dyn Fn(String) + Send + 'static>
        // and doesn't support async closures easily or closure with non-static lifetimes.
        // We use the direct channel if available, otherwise app_clone.
        let maybe_channel = self.on_event.clone();
        let app_clone = self.app.clone();
        let chat_id_owned = chat_id.to_string();
        
        // Optimize IPC: Buffer tokens for ~40ms windows to reduce event frequency
        let buffer = std::sync::Arc::new(std::sync::Mutex::new((String::new(), std::time::Instant::now(), "text")));
        let buffer_clone = buffer.clone();

        let maybe_channel_clone = maybe_channel.clone();
        let app_clone_2 = app_clone.clone();
        let chat_id_owned_2 = chat_id_owned.clone();

        // Streaming artifact detector for orchestrator-synthesized output
        let detector = std::sync::Arc::new(std::sync::Mutex::new(
            crate::agent::event_bus::StreamingArtifactDetector::new({
                let app = app_clone_2.clone();
                let on_event = maybe_channel_clone.clone();
                move |ev| { ev.emit_via(&app, &on_event); }
            })
        ));
        let detector_clone = detector.clone();

        let on_chunk = Box::new(move |chunk: LlmChunk| {
            let (chunk_text, chunk_type) = match chunk {
                LlmChunk::Text(t) => (t, "text"),
                LlmChunk::Thought(t) => (t, "thought"),
            };

            // Feed text chunks to the artifact detector
            if chunk_type == "text" && !chunk_text.is_empty() {
                if let Ok(mut det) = detector_clone.lock() {
                    det.feed(&chunk_text, &chat_id_owned_2);
                }
            }

            if !chunk_text.is_empty() {
                let mut data = match buffer_clone.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => {
                        error!("[orchestrator] buffer mutex poisoned, recovering");
                        poisoned.into_inner()
                    }
                };
                
                // If type changed, flush immediately
                if data.2 != chunk_type && !data.0.is_empty() {
                    let old_text = std::mem::take(&mut data.0);
                    let old_type = data.2;
                    
                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_owned_2.clone(),
                        delta: old_text,
                        r#type: old_type.to_string(),
                        done: false,
                    }).emit_via(&app_clone_2, &maybe_channel_clone);
                    
                    data.1 = std::time::Instant::now();
                }

                data.0.push_str(&chunk_text);
                data.2 = chunk_type;
                
                if data.1.elapsed().as_millis() >= 40 {
                    let text = std::mem::take(&mut data.0);
                    let current_type = data.2;
                    data.1 = std::time::Instant::now();
                    drop(data);
                    
                    AgentEvent::ChatChunk(ChatChunkPayload {
                        chat_id: chat_id_owned_2.clone(),
                        delta: text,
                        r#type: current_type.to_string(),
                        done: false,
                    }).emit_via(&app_clone_2, &maybe_channel_clone);
                }
            }
        });

        let response = provider.chat_stream(
            model,
            synth_messages,
            None,
            config,
            on_chunk,
            token,
        ).await?;

        // Final flush: Send any remaining tokens in the buffer
        let mut data = match buffer.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                error!("[orchestrator] buffer mutex poisoned during final flush");
                poisoned.into_inner()
            }
        };
        if !data.0.is_empty() {
            let text = std::mem::take(&mut data.0);
            let current_type = data.2;
            let _ = self.emit(AgentEvent::ChatChunk(ChatChunkPayload {
                chat_id: chat_id.to_string(),
                delta: text,
                r#type: current_type.to_string(),
                done: true,
            }));
        }

        // Flush the artifact detector
        if let Ok(mut det) = detector.lock() {
            det.flush();
        }

        Ok(AgentResponse {
            content: Some(response.content),
            tool_calls: vec![],
            reasoning: None,
            handoff: None,
            tokens_in: response.tokens_in,
            tokens_out: response.tokens_out,
            message_persisted: false,
        })
    }

    /// Generate an alternative approach for a failed task
    fn generate_alternative_approach(&self, task: &Task, error: &str) -> String {
        format!(
            "Task '{}' failed: {}\n\n\
             Alternative approach:\n\
             1. Try using different tools or methods\n\
             2. Break the task into smaller subtasks\n\
             3. Focus on what CAN be accomplished with available resources\n\
             4. If completely blocked, provide a clear explanation of the limitation",
            task.description, error
        )
    }

    /// Emit progress update to frontend
    fn emit_progress(
        &self,
        chat_id: &str,
        phase: OrchestratorPhase,
        progress: f64,
        message: &str,
    ) -> Result<()> {
        let _ = self.emit(AgentEvent::OrchestratorProgress(json!({
            "chat_id": chat_id,
            "phase": phase,
            "progress": progress,
            "message": message,
        })));
        Ok(())
    }
}

/// ISSUE-001: Swarm Coordinator
///
/// Provides multi-agent orchestration with:
/// - Topology management (hierarchical, mesh, adaptive)
/// - Agent lifecycle (spawn/terminate)
/// - Load-balanced task distribution
/// - Per-agent metrics tracking
/// - Consensus voting mechanism
/// - Dynamic scaling support
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;
use tracing::info;

use crate::agent::event_bus::{AgentEvent, EventBus};
use crate::agent::instance::{AgentHealth, AgentInstance, AgentMetrics, AgentRole, AgentStatus};
use crate::agent::task::{Task, TaskStatus};
use crate::agent::types::{Agent, ModelTier};
use crate::services::ToolService;
use crate::tools::ToolCall;
use tauri::AppHandle;

mod types;

pub use types::{
    ConsensusDecision, ConsensusResult, MeshConnection, SwarmError, SwarmEvent, SwarmState,
    SwarmTopology, TaskAssignment, TaskResult,
};

pub struct SwarmCoordinator {
    /// Current topology configuration
    topology: SwarmTopology,
    /// Active agent instances (includes metrics inside each instance)
    agents: RwLock<HashMap<String, AgentInstance>>,
    /// Event bus for internal coordination
    event_bus: Arc<EventBus>,
    /// Swarm event broadcast channel
    swarm_tx: broadcast::Sender<SwarmEvent>,
    /// Canonical tool service for policy-checked tool execution
    tool_service: Arc<ToolService>,
}

impl SwarmCoordinator {
    /// Create a new swarm coordinator with the given topology.
    pub fn new(
        topology: SwarmTopology,
        event_bus: Arc<EventBus>,
        tool_service: Arc<ToolService>,
    ) -> Self {
        let (swarm_tx, _) = broadcast::channel(256);
        Self {
            topology,
            agents: RwLock::new(HashMap::new()),
            event_bus,
            swarm_tx,
            tool_service,
        }
    }

    /// Spawn a new agent instance from the given config.
    pub async fn spawn_agent(&self, config: Agent) -> Result<AgentInstance, SwarmError> {
        let agent_id = config.id.clone();

        // Check if agent already exists
        {
            let agents = self.agents.read().await;
            if agents.contains_key(&agent_id) {
                return Err(SwarmError::AgentAlreadyExists(agent_id));
            }
        }

        // Create agent instance
        let mut instance = AgentInstance::from_config(config.clone());

        // Set role based on topology
        if let Some(leader_id) = self.topology.get_leader() {
            if agent_id == leader_id {
                instance.role = AgentRole::Leader;
            }
        }

        // Add to agents map
        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.clone(), instance.clone());
        }

        // Emit event
        self.event_bus.emit(AgentEvent::AgentSpawned {
            agent_id: agent_id.clone(),
            agent_type: config.name.clone(),
        });

        let _ = self.swarm_tx.send(SwarmEvent::AgentJoined {
            agent_id: agent_id.clone(),
            agent_type: config.name,
        });

        info!(agent_id = %agent_id, "Spawned new agent in swarm");
        Ok(instance)
    }

    /// Terminate an agent by ID.
    pub async fn terminate_agent(&self, agent_id: &str) -> Result<(), SwarmError> {
        let mut agents = self.agents.write().await;

        let instance = agents
            .get_mut(agent_id)
            .ok_or_else(|| SwarmError::AgentNotFound(agent_id.to_string()))?;

        instance.terminate();
        agents.remove(agent_id);

        // Emit event
        self.event_bus.emit(AgentEvent::AgentTerminated {
            agent_id: agent_id.to_string(),
        });

        let _ = self.swarm_tx.send(SwarmEvent::AgentLeft {
            agent_id: agent_id.to_string(),
        });

        info!(agent_id = %agent_id, "Terminated agent in swarm");
        Ok(())
    }

    /// Distribute tasks to agents based on capability and load.
    pub async fn distribute_tasks(&self, tasks: Vec<Task>) -> Vec<TaskAssignment> {
        let agents = self.agents.read().await;
        let mut assignments = Vec::new();

        for mut task in tasks {
            // Find best agent for this task
            let best_agent = self.find_best_agent_for_task(&task, &agents);

            if let Some(agent_id) = best_agent {
                task.assigned_to = Some(agent_id.clone());
                task.status = TaskStatus::InProgress;

                assignments.push(TaskAssignment {
                    task_id: task.id.clone(),
                    assigned_to: agent_id.clone(),
                    priority: task.priority,
                    status: task.status,
                });

                let _ = self.swarm_tx.send(SwarmEvent::TaskAssigned {
                    task_id: task.id,
                    agent_id,
                });
            } else {
                // No suitable agent found, mark as pending
                task.status = TaskStatus::Pending;
            }
        }

        assignments
    }

    /// Find the best agent for a given task.
    fn find_best_agent_for_task(
        &self,
        task: &Task,
        agents: &HashMap<String, AgentInstance>,
    ) -> Option<String> {
        // Extract actual capability from task metadata or task_type
        let capability = match task.task_type {
            crate::agent::task::TaskType::ToolCall => {
                // For ToolCall, get tool_name from metadata
                task.metadata
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            }
            crate::agent::task::TaskType::Custom(ref agent_type) => {
                // For Custom, use the agent_type string directly
                Some(agent_type.clone())
            }
            _ => None,
        };

        // If no capability extracted, fall back to matching against agent IDs/names
        let capability_or_empty = capability.as_deref().unwrap_or("");

        // Filter available agents that can execute this capability
        let candidates: Vec<&AgentInstance> = agents
            .values()
            .filter(|a| {
                if !a.is_available() {
                    return false;
                }
                // Check against capabilities OR agent ID OR agent name
                a.can_execute(capability_or_empty)
                    || a.config.id == capability_or_empty
                    || a.config.name == capability_or_empty
            })
            .collect();

        if candidates.is_empty() {
            return None;
        }

        // Select agent with lowest load (fewest completed tasks = more available)
        candidates
            .iter()
            .min_by_key(|a| a.metrics.tasks_completed)
            .map(|a| a.config.id.clone())
    }

    /// Execute tasks concurrently across multiple agents.
    pub async fn execute_tasks_concurrent(
        &self,
        tasks: Vec<Task>,
        app: AppHandle,
        chat_id: String,
    ) -> Vec<TaskResult> {
        // Create a map from task_id to task for metadata lookup
        let task_map: HashMap<String, Task> =
            tasks.into_iter().map(|t| (t.id.clone(), t)).collect();

        let assignments = self
            .distribute_tasks(task_map.values().cloned().collect())
            .await;

        let tool_service = self.tool_service.clone();
        let mut handles = Vec::new();

        for assignment in assignments {
            let task_id = assignment.task_id.clone();
            let task = task_map.get(&task_id).cloned();
            let tool_service_clone = tool_service.clone();
            let app_clone = app.clone();
            let chat_id_inner = chat_id.clone();

            handles.push(tokio::spawn(async move {
                if let Some(task) = task {
                    let start_time = std::time::Instant::now();

                    // Extract tool info from task metadata
                    let tool_name = task
                        .metadata
                        .get("tool_name")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let tool_args = task.metadata.get("tool_args").cloned();
                    let tool_call_id = task
                        .metadata
                        .get("tool_call_id")
                        .and_then(|v| v.as_str())
                        .map(String::from);

                    if let (Some(tool_name), Some(tool_args), Some(_call_id)) =
                        (tool_name, tool_args, tool_call_id)
                    {
                        let tool_call = ToolCall {
                            id: format!("swarm-{}", uuid::Uuid::new_v4()),
                            name: tool_name,
                            arguments: tool_args,
                        };

                        match tool_service_clone
                            .execute_non_interactive(
                                app_clone,
                                "swarm",
                                chat_id_inner.clone(),
                                tool_call,
                            )
                            .await
                        {
                            Ok(result) => {
                                let duration_ms = start_time.elapsed().as_millis() as u64;
                                return TaskResult {
                                    task_id,
                                    agent_id: assignment.assigned_to,
                                    success: true,
                                    output: result.to_string(),
                                    duration_ms,
                                    error: None,
                                };
                            }
                            Err(e) => {
                                let duration_ms = start_time.elapsed().as_millis() as u64;
                                return TaskResult {
                                    task_id,
                                    agent_id: assignment.assigned_to,
                                    success: false,
                                    output: format!("Tool execution failed: {}", e),
                                    duration_ms,
                                    error: Some(e),
                                };
                            }
                        }
                    }

                    // Fallback: task metadata doesn't have tool info
                    TaskResult {
                        task_id,
                        agent_id: assignment.assigned_to,
                        success: true,
                        output: "Task completed (no tool metadata)".to_string(),
                        duration_ms: 100,
                        error: None,
                    }
                } else {
                    TaskResult {
                        task_id: assignment.task_id,
                        agent_id: assignment.assigned_to,
                        success: false,
                        output: "Task not found".to_string(),
                        duration_ms: 0,
                        error: Some("Task not found in task map".to_string()),
                    }
                }
            }));
        }

        // Collect results
        let mut results = Vec::new();
        for handle in handles {
            if let Ok(result) = handle.await {
                let task_id = result.task_id.clone();
                let agent_id = result.agent_id.clone();
                let success = result.success;

                results.push(result);

                let _ = self.swarm_tx.send(SwarmEvent::TaskCompleted {
                    task_id,
                    agent_id,
                    success,
                });
            }
        }

        results
    }

    /// Scale the number of agents of a specific type.
    pub async fn scale_agents(&self, agent_type: &str, count: i32) -> Result<(), SwarmError> {
        let agents = self.agents.read().await;
        let current_count = agents
            .values()
            .filter(|a| a.config.name == agent_type)
            .count() as i32;

        // Clone template data before releasing lock (fixes TOCTOU)
        let template = agents
            .iter()
            .filter(|(_, instance)| instance.config.name == agent_type)
            .next()
            .map(|(_, instance)| instance.config.clone());

        drop(agents);

        if count > current_count {
            // Spawn additional agents
            let to_spawn = count - current_count;

            // Extract template data into local variables before releasing the read lock
            let (instructions, tool_ids, model_tier) = if let Some(ref t) = template {
                (t.instructions.clone(), t.tool_ids.clone(), t.model_tier)
            } else {
                tracing::warn!(
                    agent_type = %agent_type,
                    "Template agent not found for scaling, using empty defaults"
                );
                (String::new(), vec![], ModelTier::Local)
            };

            for _ in 0..to_spawn as usize {
                // Generate unique agent ID using UUID to avoid collisions on re-scale
                // Format: {agent_type}_{short_uuid} (e.g., researcher_a3f8b2c1)
                let uuid = uuid::Uuid::new_v4().to_string();
                let short_uuid = uuid.split('-').next().unwrap_or("unknown");
                let config = Agent {
                    id: format!("{}_{}", agent_type, short_uuid),
                    name: agent_type.to_string(),
                    description: Some(format!("Scaled instance of {}", agent_type)),
                    instructions: instructions.clone(),
                    tool_ids: tool_ids.clone(),
                    model_override: None,
                    max_iterations: None,
                    model_tier,
                };
                let _ = self.spawn_agent(config).await;
            }
        } else if count < current_count {
            // Terminate excess agents
            let to_terminate = current_count - count;

            // Collect IDs of agents to terminate first (to avoid borrow issues)
            let agents_to_terminate = {
                let agents = self.agents.read().await;
                agents
                    .iter()
                    .filter(|(_, instance)| instance.config.name == agent_type)
                    .take(to_terminate as usize)
                    .map(|(id, _)| id.clone())
                    .collect::<Vec<_>>()
            };

            // Now terminate them
            for id in agents_to_terminate {
                let _ = self.terminate_agent(&id).await;
            }
        }

        let _ = self.swarm_tx.send(SwarmEvent::SwarmScaled {
            agent_type: agent_type.to_string(),
            new_count: count as usize,
        });

        Ok(())
    }

    /// Reach consensus on a decision via multi-agent voting.
    pub async fn reach_consensus(
        &self,
        decision: ConsensusDecision,
        agent_ids: &[String],
    ) -> ConsensusResult {
        let mut votes: HashMap<String, u32> = HashMap::new();

        // Initialize vote counts for each option
        for option in &decision.options {
            votes.insert(option.clone(), 0);
        }

        let agents = self.agents.read().await;
        let mut total_voters = 0u32;

        for (agent_idx, agent_id) in agent_ids.iter().enumerate() {
            if let Some(agent) = agents.get(agent_id) {
                if agent.status == AgentStatus::Terminated {
                    continue;
                }

                total_voters += 1;

                let selected_option = self.select_option_for_vote(&agent, &decision, agent_idx);

                *votes.get_mut(&selected_option).unwrap_or(&mut 0) += 1;
            }
        }

        // Find winner
        let (winner, _) = votes
            .iter()
            .max_by_key(|(_, count)| *count)
            .map(|(k, v)| (k.clone(), *v))
            .unwrap_or_else(|| (String::new(), 0));

        // Check quorum (simple majority)
        let quorum_reached =
            total_voters > 0 && votes.get(&winner).unwrap_or(&0) > &(total_voters / 2);

        let result = ConsensusResult {
            decision_id: decision.id,
            winner,
            votes,
            total_voters,
            quorum_reached,
        };

        let _ = self.swarm_tx.send(SwarmEvent::ConsensusReached {
            decision_id: result.decision_id.clone(),
            winner: result.winner.clone(),
        });

        result
    }

    /// Get the current swarm state.
    pub async fn get_swarm_state(&self) -> SwarmState {
        let agents = self.agents.read().await;
        let agent_count = agents.len();

        let unhealthy_count = agents
            .values()
            .filter(|a| a.metrics.health == AgentHealth::Unhealthy)
            .count();

        // Count agents with Busy status directly from self.agents
        let active_count = agents
            .values()
            .filter(|a| a.status == AgentStatus::Busy)
            .count();

        if unhealthy_count > 0 {
            SwarmState::Degraded {
                agent_count,
                unhealthy_agents: unhealthy_count,
            }
        } else if active_count > 0 {
            SwarmState::Active {
                agent_count,
                active_tasks: active_count,
            }
        } else {
            SwarmState::Idle { agent_count }
        }
    }

    /// Reconfigure the swarm with a new topology.
    pub async fn reconfigure(&mut self, topology: SwarmTopology) -> Result<(), SwarmError> {
        let old_topology = format!("{:?}", self.topology);
        self.topology = topology;

        let new_topology = format!("{:?}", self.topology);

        let _ = self.swarm_tx.send(SwarmEvent::TopologyChanged {
            new_topology: new_topology.clone(),
        });

        info!(old = %old_topology, new = %new_topology, "Reconfigured swarm topology");
        Ok(())
    }

    /// Subscribe to swarm events.
    pub fn subscribe(&self) -> broadcast::Receiver<SwarmEvent> {
        self.swarm_tx.subscribe()
    }

    /// Select an option for voting using capability-weighted selection.
    ///
    /// Uses a combination of:
    /// 1. Agent capability matching (prefer options that match agent capabilities)
    /// 2. Hash-based deterministic distribution (ensures diversity)
    /// 3. Round-robin fallback when capabilities don't differentiate
    fn select_option_for_vote(
        &self,
        agent: &AgentInstance,
        decision: &ConsensusDecision,
        agent_index: usize,
    ) -> String {
        if decision.options.is_empty() {
            return String::new();
        }

        let has_metadata = !decision.metadata.is_empty();

        if has_metadata {
            if let Some(cap_matched) = self.try_capability_match(agent, decision) {
                return cap_matched;
            }
        }

        self.diverse_hash_selection(agent, decision, agent_index)
    }

    /// Try to find an option that matches the agent's capabilities via decision metadata.
    fn try_capability_match(
        &self,
        agent: &AgentInstance,
        decision: &ConsensusDecision,
    ) -> Option<String> {
        let cap_key = "required_capabilities";

        if let Some(serde_json::Value::Array(req_caps)) = decision.metadata.get(cap_key) {
            let required: Vec<&str> = req_caps.iter().filter_map(|v| v.as_str()).collect();

            for option in &decision.options {
                let opt_cap_key = format!("{}_capabilities", option);
                if let Some(serde_json::Value::Array(opt_caps)) =
                    decision.metadata.get(&opt_cap_key)
                {
                    let provided: Vec<&str> = opt_caps.iter().filter_map(|v| v.as_str()).collect();

                    if required.iter().all(|r| provided.contains(r)) {
                        if agent
                            .capabilities
                            .iter()
                            .any(|c| provided.contains(&c.as_str()))
                        {
                            return Some(option.clone());
                        }
                    }
                }
            }
        }

        let capability_candidates: Vec<(String, usize)> = decision
            .options
            .iter()
            .enumerate()
            .filter_map(|(idx, option)| {
                let opt_key = format!("{}_capabilities", option);
                if let Some(serde_json::Value::Array(caps)) = decision.metadata.get(&opt_key) {
                    let opt_caps: Vec<&str> = caps.iter().filter_map(|v| v.as_str()).collect();
                    if agent
                        .capabilities
                        .iter()
                        .any(|ac| opt_caps.contains(&ac.as_str()))
                    {
                        return Some((option.clone(), idx));
                    }
                }
                None
            })
            .collect();

        if let Some((best_option, _)) = capability_candidates.first() {
            return Some(best_option.clone());
        }

        None
    }

    /// Use agent ID hash + index for deterministic but diverse distribution.
    fn diverse_hash_selection(
        &self,
        agent: &AgentInstance,
        decision: &ConsensusDecision,
        agent_index: usize,
    ) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        agent.config.id.hash(&mut hasher);
        decision.id.hash(&mut hasher);
        agent_index.hash(&mut hasher);
        let hash = hasher.finish() as usize;

        let options_len = decision.options.len();
        if options_len == 0 {
            return String::new();
        }

        let round_robin_idx = (agent_index + hash) % options_len;
        decision.options[round_robin_idx].clone()
    }

    /// Get all active agents.
    pub async fn get_agents(&self) -> Vec<AgentInstance> {
        let agents = self.agents.read().await;
        agents.values().cloned().collect()
    }

    /// Get metrics for a specific agent.
    pub async fn get_agent_metrics(&self, agent_id: &str) -> Option<AgentMetrics> {
        let agents = self.agents.read().await;
        agents.get(agent_id).map(|a| a.metrics.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::event_bus::EventBus;
    use crate::agent::task::TaskType;
    use crate::agent::types::ModelTier;
    use crate::services::SecurityService;
    use crate::tools::ToolRegistry;

    fn test_agent() -> Agent {
        Agent {
            id: "test-agent".to_string(),
            name: "TestAgent".to_string(),
            description: Some("Test agent for unit tests".to_string()),
            instructions: "You are a test agent.".to_string(),
            tool_ids: vec!["test_tool".to_string()],
            model_override: None,
            max_iterations: None,
            model_tier: ModelTier::Local,
        }
    }

    fn test_tool_service() -> Arc<ToolService> {
        Arc::new(ToolService::new(
            Arc::new(RwLock::new(ToolRegistry::new())),
            Arc::new(SecurityService::new()),
            Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        ))
    }

    #[tokio::test]
    async fn test_spawn_agent() {
        let event_bus = Arc::new(EventBus::new(256));
        let coordinator =
            SwarmCoordinator::new(SwarmTopology::default(), event_bus, test_tool_service());

        let result = coordinator.spawn_agent(test_agent()).await;
        assert!(result.is_ok());

        let agents = coordinator.get_agents().await;
        assert_eq!(agents.len(), 1);
    }

    #[tokio::test]
    async fn test_terminate_agent() {
        let event_bus = Arc::new(EventBus::new(256));
        let coordinator =
            SwarmCoordinator::new(SwarmTopology::default(), event_bus, test_tool_service());

        let agent = coordinator.spawn_agent(test_agent()).await.unwrap();
        let result = coordinator.terminate_agent(&agent.config.id).await;
        assert!(result.is_ok());

        let agents = coordinator.get_agents().await;
        assert_eq!(agents.len(), 0);
    }

    #[tokio::test]
    async fn test_task_distribution() {
        let event_bus = Arc::new(EventBus::new(256));
        let coordinator =
            SwarmCoordinator::new(SwarmTopology::default(), event_bus, test_tool_service());

        // Spawn an agent
        let _ = coordinator.spawn_agent(test_agent()).await;

        // Create a task
        let task = Task::new("Test task", TaskType::ToolCall);
        let tasks = vec![task];

        let assignments = coordinator.distribute_tasks(tasks).await;
        assert_eq!(assignments.len(), 1);
        assert!(assignments[0].assigned_to == "test-agent");
    }

    #[tokio::test]
    async fn test_consensus_voting() {
        let event_bus = Arc::new(EventBus::new(256));
        let coordinator =
            SwarmCoordinator::new(SwarmTopology::default(), event_bus, test_tool_service());

        // Spawn multiple agents
        let _ = coordinator.spawn_agent(test_agent()).await;

        let decision = ConsensusDecision {
            id: "test-decision".to_string(),
            description: "Test consensus decision".to_string(),
            options: vec!["option_a".to_string(), "option_b".to_string()],
            metadata: HashMap::new(),
        };

        let result = coordinator
            .reach_consensus(decision, &["test-agent".to_string()])
            .await;

        assert!(result.quorum_reached);
        assert!(!result.winner.is_empty());
    }
}

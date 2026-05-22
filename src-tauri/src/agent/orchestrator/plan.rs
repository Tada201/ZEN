use anyhow::{Result, Context};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;
use tracing::{info, instrument};

use super::Orchestrator;
use super::TaskBreakdown;
use crate::agent::task::{Task, TaskType, TaskPriority};
use crate::llm::{LlmProvider, ChatRequestConfig};
use crate::db::models::ChatMessage;

impl Orchestrator {
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
}

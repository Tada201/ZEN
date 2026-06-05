import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentActivityStore } from "@/lib/stores/agentActivityStore";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useTaskStore } from "@/lib/stores/taskStore";
import type { Message } from "@/atlas/components/chat/types";

const EMPTY_MESSAGES: Message[] = [];

function PanelMetric({ label, value, tone }: { label: string; value: string | number; tone?: "active" | "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone === "active" ? "text-primary" : tone === "warn" ? "text-amber-300" : tone === "danger" ? "text-rose-300" : "text-zinc-100"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

export function ChatAnalyticsPanel() {
  const activeSessionId = useChatStore(s => s.activeSessionId);
  const messages = useChatStore(s => activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const isStreaming = useChatStore(s => activeSessionId ? s.streamingChats[activeSessionId] ?? false : false);
  const artifacts = useChatStore(s => s.artifacts);
  const activeTasks = useAgentActivityStore(s => s.activeTasks);
  const activities = useAgentActivityStore(s => s.activities);

  const assistantMessages = messages.filter(message => message.role === "assistant");
  const toolCalls = assistantMessages.flatMap(message => message.toolCalls || []);
  const failedMessages = messages.filter(message => message.status === "failed" || message.error);
  const sessionTasks = activeTasks.filter(task => task.chatId === activeSessionId);
  const sessionActivities = activities.filter(activity => activity.chatId === activeSessionId);
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <PanelMetric label="messages" value={messages.length} tone={isStreaming ? "active" : undefined} />
            <PanelMetric label="tools" value={toolCalls.length} />
            <PanelMetric label="tasks" value={sessionTasks.length} />
            <PanelMetric label="errors" value={failedMessages.length} tone={failedMessages.length > 0 ? "danger" : undefined} />
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Current stream</div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-zinc-300">{isStreaming ? "Assistant is streaming" : "Idle"}</span>
              <span className={isStreaming ? "text-primary" : "text-zinc-500"}>{lastMessage?.status || "ready"}</span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Session activity</div>
            <div className="space-y-1.5">
              {sessionActivities.slice(-6).reverse().map(activity => (
                <div key={activity.id} className="flex min-w-0 items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate text-zinc-300">{activity.message || activity.type}</span>
                  <span className="shrink-0 text-[11px] uppercase text-zinc-500">{activity.type.replace("_", " ")}</span>
                </div>
              ))}
              {sessionActivities.length === 0 && (
                <div className="text-[12px] text-zinc-500">No live activity for this session yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Artifacts</div>
            <div className="text-[12px] text-zinc-300">{artifacts.length} generated artifact{artifacts.length === 1 ? "" : "s"} in local runtime.</div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function WorkflowPanel() {
  const activeSessionId = useChatStore(s => s.activeSessionId);
  const taskMap = useTaskStore(s => s.tasks);
  const activeTasks = useAgentActivityStore(s => s.activeTasks);
  const pendingPlan = useAgentActivityStore(s => s.pendingPlan);
  const tasks = Array.from(taskMap.values()).filter(task => !activeSessionId || task.chatId === activeSessionId);
  const agentTasks = activeTasks.filter(task => !activeSessionId || task.chatId === activeSessionId);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <PanelMetric label="queued" value={tasks.filter(task => task.status === "pending").length} />
            <PanelMetric label="running" value={tasks.filter(task => task.status === "in-progress").length + agentTasks.filter(task => task.status === "in_progress").length} tone="active" />
            <PanelMetric label="done" value={tasks.filter(task => task.status === "completed").length + agentTasks.filter(task => task.status === "completed").length} />
            <PanelMetric label="failed" value={tasks.filter(task => task.status === "failed").length + agentTasks.filter(task => task.status === "failed").length} tone="danger" />
          </div>

          {pendingPlan?.battlePlan && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.035] p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-primary">Pending plan</div>
              <div className="space-y-1.5">
                {pendingPlan.battlePlan.steps.slice(0, 6).map((step, index) => (
                  <div key={`${step}-${index}`} className="flex gap-2 text-[12px] leading-5 text-zinc-300">
                    <span className="text-zinc-500">{index + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Task checklist</div>
            <div className="space-y-2">
              {tasks.slice(0, 12).map(task => (
                <div key={task.id} className="min-w-0 rounded-md bg-black/20 px-2 py-1.5">
                  <div className="flex min-w-0 items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate text-zinc-300">{task.description}</span>
                    <span className="shrink-0 text-[11px] uppercase text-zinc-500">{task.status}</span>
                  </div>
                  <div className="mt-1 h-1 rounded bg-white/10">
                    <div className="h-full rounded bg-primary/70" style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
                  </div>
                </div>
              ))}
              {tasks.length === 0 && agentTasks.length === 0 && (
                <div className="text-[12px] text-zinc-500">No workflow tasks are active for this session.</div>
              )}
            </div>
          </div>

          {agentTasks.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Agent tasks</div>
              <div className="space-y-1.5">
                {agentTasks.slice(0, 10).map(task => (
                  <div key={task.id} className="flex min-w-0 items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate text-zinc-300">{task.task}</span>
                    <span className="shrink-0 text-[11px] uppercase text-zinc-500">{task.status.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

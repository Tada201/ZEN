import { buildAgentDelegationLaneModel, type AgentDelegationLaneModel } from '@/atlas/components/chat/agentDelegationLaneModel';
import { buildAgentExecutionTraceModel } from '@/atlas/components/chat/agentExecutionTraceModel';
import { groupToolCalls } from '@/atlas/components/chat/assistantMessageParts';
import type { Message, Step, ToolCall } from '@/atlas/components/chat/types';

export const EMPTY_MESSAGES: Message[] = [];

export type LiveAgentPanelModel = {
    message?: Message;
    actionSteps: Step[];
    toolCalls: ToolCall[];
    lanes: AgentDelegationLaneModel[];
    runningAgents: number;
    runningTools: number;
    approvals: number;
    completedAgents: number;
    activeSummary: string;
};

function isLiveAssistantMessage(message: Message) {
    if (message.role !== 'assistant') return false;
    if (message.status === 'sending') return true;
    return Boolean(message.steps?.length || message.toolCalls?.length);
}

function agentLaneKey(step: Step) {
    const spawn = step.metadata?.spawn;
    return [
        spawn?.parentAgent || step.metadata?.parentAgentId || 'main',
        spawn?.childAgent || step.metadata?.agentName || step.metadata?.agentId || 'agent',
        step.metadata?.iteration ?? '',
    ].join('::');
}

export function buildLiveAgentPanelModel(messages: Message[]): LiveAgentPanelModel {
    const assistantMessages = messages.filter(isLiveAssistantMessage);
    const message = [...assistantMessages].reverse().find((candidate: Message) => candidate.status === 'sending')
        || assistantMessages[assistantMessages.length - 1];
    const actionSteps = (message?.steps || []).filter((step: Step) => step?.type === 'action');
    const stepToolCalls = (message?.steps || [])
        .filter((step: Step) => step?.type === 'tool-call' && step.toolCall)
        .map((step: Step) => step.toolCall as ToolCall);
    const fallbackToolStatus: ToolCall['status'] = message?.status === 'sending' ? 'running' : 'completed';
    const toolCalls = groupToolCalls([...(message?.toolCalls || []), ...stepToolCalls])
        .map((tool) => ({ ...tool, status: tool.status || fallbackToolStatus }));
    const trace = buildAgentExecutionTraceModel(toolCalls, actionSteps);
    const laneSteps = actionSteps.filter((step: Step) => (
        step.kind === 'agent_spawn' ||
        step.kind === 'agent_chunk' ||
        step.kind === 'agent_complete'
    ));
    const latestLaneSteps = new Map<string, Step>();

    laneSteps.forEach((step: Step) => {
        latestLaneSteps.set(agentLaneKey(step), step);
    });

    const lanes = Array.from(latestLaneSteps.values())
        .map(buildAgentDelegationLaneModel)
        .filter((lane): lane is AgentDelegationLaneModel => Boolean(lane));

    return {
        message,
        actionSteps,
        toolCalls,
        lanes,
        runningAgents: lanes.filter((lane) => lane.status === 'running').length,
        runningTools: toolCalls.filter((tool) => tool.status === 'running').length,
        approvals: toolCalls.filter((tool) => tool.status === 'awaiting_approval').length,
        completedAgents: lanes.filter((lane) => lane.status === 'completed').length,
        activeSummary: trace.activeLaneSummary || (message?.status === 'sending' ? 'Assistant is streaming' : 'No active run'),
    };
}

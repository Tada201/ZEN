import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/lib/stores/useChatStore';
import { useAgentActivityStore } from '@/lib/stores/agentActivityStore';
import './agent-orchestrator.css';
import BirdsEyeView from './BirdsEyeView';
import AgentWorkspace from './AgentWorkspace';
import { EMPTY_MESSAGES, buildLiveAgentPanelModel } from './agentOrchestratorModel';

export function AgentOrchestratorPanel() {
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const sessionMessages = useChatStore(s =>
        activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES,
    );
    const isSessionStreaming = useChatStore(s =>
        activeSessionId ? s.streamingChats[activeSessionId] ?? false : false,
    );
    const activeTasks = useAgentActivityStore(s => s.activeTasks);
    const selectedTaskId = useAgentActivityStore(s => s.selectedTaskId);
    const setSelectedTaskId = useAgentActivityStore(s => s.setSelectedTaskId);
    const clearTasks = useAgentActivityStore(s => s.clearTasks);
    const removeTask = useAgentActivityStore(s => s.removeTask);
    const activities = useAgentActivityStore(s => s.activities);

    const liveModel = useMemo(() => buildLiveAgentPanelModel(sessionMessages), [sessionMessages]);

    const selectedTask = useMemo(
        () => activeTasks.find(t => t.id === selectedTaskId),
        [activeTasks, selectedTaskId],
    );

    const taskLogs = useMemo(() => {
        if (!selectedTask) return [];
        return activities.filter(
            a =>
                a.chatId === selectedTask.chatId &&
                (a.agentId === selectedTask.agentId || a.agentName === selectedTask.agentName),
        );
    }, [activities, selectedTask]);

    const sessionTasks = useMemo(
        () => activeTasks.filter(t => t.chatId === activeSessionId),
        [activeSessionId, activeTasks],
    );
    const crossSessionTasks = useMemo(
        () => activeTasks.filter(t => t.chatId !== activeSessionId),
        [activeSessionId, activeTasks],
    );
    const runningTasks = useMemo(
        () => sessionTasks.filter(t => t.status === 'in_progress'),
        [sessionTasks],
    );
    const pendingTasks = useMemo(
        () => sessionTasks.filter(t => t.status === 'pending'),
        [sessionTasks],
    );
    const historyTasks = useMemo(
        () => sessionTasks.filter(t => t.status === 'completed' || t.status === 'failed'),
        [sessionTasks],
    );

    const handleRemoveSelected = () => {
        if (!selectedTask) return;
        removeTask(selectedTask.id);
        setSelectedTaskId(null);
    };

    return (
        <div className="agent-orchestrator animate-fade-in">
            <AnimatePresence mode="wait">
                {selectedTask ? (
                    <AgentWorkspace
                        key="workspace"
                        selectedTask={selectedTask}
                        taskLogs={taskLogs}
                        onBack={() => setSelectedTaskId(null)}
                        onRemoveTask={() => handleRemoveSelected()}
                    />
                ) : (
                    <BirdsEyeView
                        key="birds-eye"
                        activeTasks={activeTasks}
                        runningTasks={runningTasks}
                        pendingTasks={pendingTasks}
                        historyTasks={historyTasks}
                        crossSessionTasks={crossSessionTasks}
                        liveModel={liveModel}
                        isSessionStreaming={isSessionStreaming}
                        onSelectTask={setSelectedTaskId}
                        onCancelTask={removeTask}
                        onClearAll={clearTasks}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

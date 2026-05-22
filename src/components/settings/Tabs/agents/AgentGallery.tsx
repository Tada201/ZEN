import { useState, useEffect, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tool_count: number;
  model_override?: string;
  max_iterations?: number;
}

interface AgentConfig {
  agent_id: string;
  agent_name: string;
  model_name: string;
  context_window: number;
  max_messages_in_memory: number;
  max_iterations: number;
  enabled_tools: string[];
  system_prompt_override?: string;
}

const FALLBACK_AGENTS: AgentInfo[] = [
  {
    id: 'code-analysis-agent',
    name: 'Code Analysis Agent',
    description: 'Deep static analysis of codebases for patterns, vulnerabilities, and optimization opportunities.',
    tool_count: 8,
    max_iterations: 50,
  },
  {
    id: 'refactor-agent',
    name: 'Refactor Agent',
    description: 'Automated refactoring with SOLID principles and clean code guidelines enforcement.',
    tool_count: 6,
    max_iterations: 30,
  },
  {
    id: 'security-audit-agent',
    name: 'Security Audit Agent',
    description: 'Comprehensive security scanning and vulnerability assessment for code repositories.',
    tool_count: 12,
    max_iterations: 100,
  },
];

export const AgentGallery = memo(() => {
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK_AGENTS);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [spawnResult, setSpawnResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentList, configList] = await Promise.all([
        invoke<AgentInfo[]>('list_agents'),
        invoke<AgentConfig[]>('list_agents_with_configs'),
      ]);
      if (agentList?.length) setAgents(agentList);
      if (configList?.length) setConfigs(configList);
    } catch (error) {
      console.warn('[AgentGallery] Tauri backend unavailable, using fallback agents');
    } finally {
      setLoading(false);
    }
  };

  const getAgentConfig = (agentId: string): AgentConfig | undefined => {
    return configs.find(c => c.agent_id === agentId);
  };

  const filteredAgents = agents.filter(agent => {
    const query = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.id.toLowerCase().includes(query) ||
      agent.description.toLowerCase().includes(query)
    );
  });

  const handleTestSpawn = async () => {
    if (!selectedAgent || !testMessage.trim()) return;

    setSendingTest(true);
    setSpawnResult(null);

    try {
      await invoke('spawn_agent', {
        agentId: selectedAgent.id,
        message: testMessage,
        options: {},
      });
      setSpawnResult({
        success: true,
        message: 'Cognitive handshake complete. Agent initialized in sandbox.'
      });
      setTestMessage('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSpawnResult({
        success: false,
        message: `Handshake failed: ${errorMessage}`
      });
    } finally {
      setSendingTest(false);
    }
  };

  const closeSpawnModal = () => {
    setSelectedAgent(null);
    setSpawnResult(null);
    setTestMessage('');
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-zinc-200 uppercase tracking-tight">Agent Command Registry</span>
          <span className="text-[11px] text-zinc-400">
            Browse and test autonomous agents available in this workspace.
          </span>
        </div>
        <div className="w-full md:w-64">
          <WorkbenchInput
            placeholder="Filter Cognitive Agents..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            icon="codicon:search"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <WorkbenchIcon name="codicon:loading" size={32} className="text-brand-purple animate-spin" />
          <span className="text-[12px] font-bold text-zinc-300 uppercase tracking-widest">
            Synchronizing Agent Registry...
          </span>
        </div>
      )}

      {/* Agent Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => {
            const config = getAgentConfig(agent.id);
            return (
              <div
                key={agent.id}
                className="rounded-xl bg-zinc-900/15 border border-white/[0.04] p-5 flex flex-col gap-4 hover:bg-white/[0.04] hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-purple/10 flex items-center justify-center border border-brand-purple/20">
                    <WorkbenchIcon name="codicon:robot" size={20} className="text-brand-purple" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[13px] font-bold text-white truncate">{agent.name}</h3>
                    <span className="text-[10px] font-mono text-zinc-500">{agent.id}</span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-3">
                  {agent.description}
                </p>

                <div className="bg-zinc-950/45 border border-white/[0.06] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest">Capabilities</span>
                    <span className="text-[11px] font-bold text-emerald-400 font-mono">
                      {agent.tool_count} ACTIVE
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest flex-shrink-0">Engine</span>
                    <span className="text-[11px] font-bold text-brand-purple truncate text-right">
                      {config?.model_name || agent.model_override || 'UNBOUND'}
                    </span>
                  </div>
                </div>

                <WorkbenchButton
                  variant="secondary"
                  className="w-full h-8 gap-2 border-white/5 hover:bg-brand-purple/10 hover:border-brand-purple/20 group"
                  onClick={() => setSelectedAgent(agent)}
                >
                  <WorkbenchIcon name="codicon:zap" size={14} className="group-hover:text-brand-purple transition-colors" />
                  <span className="text-[10px] font-extrabold uppercase">Test Agent</span>
                </WorkbenchButton>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
          <WorkbenchIcon name="codicon:search" size={40} className="text-zinc-400" />
          <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">No agents match your query</span>
        </div>
      )}

      {/* Spawn Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeSpawnModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-purple/10 flex items-center justify-center border border-brand-purple/20">
                    <WorkbenchIcon name="codicon:circuit-board" size={18} className="text-brand-purple" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-extrabold text-brand-purple uppercase tracking-widest">Cognitive Handshake</span>
                    <span className="text-[13px] font-bold text-zinc-100 uppercase">{selectedAgent.name}</span>
                  </div>
                </div>
                <WorkbenchButton
                  onClick={closeSpawnModal}
                  className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors text-zinc-400 hover:text-white"
                >
                  <WorkbenchIcon name="codicon:close" size={18} />
                </WorkbenchButton>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh]">
                <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Registry ID</span>
                      <span className="text-[11px] font-bold font-mono text-brand-purple">{selectedAgent.id}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Methods</span>
                      <span className="text-[11px] font-bold text-zinc-200">{selectedAgent.tool_count} Active</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Model Lock</span>
                      <span className="text-[11px] font-bold text-zinc-200">
                        {getAgentConfig(selectedAgent.id)?.model_name || 'System Default'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Retention</span>
                      <span className="text-[11px] font-bold text-zinc-200">
                        {getAgentConfig(selectedAgent.id)?.max_messages_in_memory || 10} Messages
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-extrabold text-zinc-300 uppercase tracking-widest ml-1">
                    Sandbox Initialization Params
                  </label>
                  <textarea
                    className="w-full h-32 bg-zinc-900 border border-white/10 rounded-xl p-4 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/20 transition-[border-color,box-shadow] resize-none"
                    placeholder="Input initial protocols or task directives..."
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                  />
                </div>

                <AnimatePresence>
                  {spawnResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={cn(
                        "p-4 rounded-xl border flex items-center gap-3",
                        spawnResult.success
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      )}
                    >
                      <WorkbenchIcon
                        name={spawnResult.success ? 'codicon:pass-filled' : 'codicon:warning'}
                        size={18}
                        className={spawnResult.success ? 'text-emerald-500' : 'text-red-500'}
                      />
                      <span className={cn("text-[11px] font-bold", spawnResult.success ? 'text-zinc-200' : 'text-red-400')}>
                        {spawnResult.message}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3 bg-zinc-900/30">
                <WorkbenchButton variant="secondary" onClick={closeSpawnModal} className="px-6">
                  <span className="text-[10px] font-extrabold uppercase">Abort</span>
                </WorkbenchButton>
                <WorkbenchButton
                  variant="primary"
                  disabled={sendingTest || !testMessage.trim()}
                  onClick={handleTestSpawn}
                  className="min-w-[140px] gap-2"
                >
                  {sendingTest ? (
                    <WorkbenchIcon name="codicon:loading" size={16} className="animate-spin" />
                  ) : (
                    <WorkbenchIcon name="codicon:send" size={16} />
                  )}
                  <span className="text-[10px] font-extrabold uppercase">
                    {sendingTest ? 'Initializing...' : 'Initialize Test'}
                  </span>
                </WorkbenchButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
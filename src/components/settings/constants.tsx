import type { NavItem, SettingCategory, TabId } from './types';

export const CATEGORIES: SettingCategory[] = ['WORKSPACE', 'AI', 'SYSTEM'];

export interface SettingRowEntry {
  id: string;
  tab: TabId;
  label: string;
  keywords: string[];
}

export const SETTINGS_REGISTRY: SettingRowEntry[] = [
  // General
  { id: 'workspace_path', tab: 'workspace', label: 'Workspace Root Path', keywords: ['directory', 'folder', 'root', 'project'] },
  { id: 'theme', tab: 'appearance', label: 'Interface Theme', keywords: ['theme', 'dark', 'light', 'tactical', 'appearance'] },
  { id: 'density', tab: 'appearance', label: 'Display Density', keywords: ['compact', 'normal', 'spacing', 'density'] },
  { id: 'animations', tab: 'appearance', label: 'Animations', keywords: ['motion', 'effects', 'transitions'] },
  { id: 'gui_boot_enable', tab: 'appearance', label: 'Boot Screen', keywords: ['startup', 'splash', 'launch'] },
  { id: 'gui_css_injection', tab: 'appearance', label: 'Custom CSS Injection', keywords: ['css', 'style', 'custom', 'theme'] },
  // Chat
  { id: 'persona_style', tab: 'chat_behavior', label: 'Response Style', keywords: ['personality', 'tone', 'behavior', 'style'] },
  { id: 'system_prompt', tab: 'chat_behavior', label: 'System Instructions', keywords: ['prompt', 'instructions', 'system', 'behavior'] },
  { id: 'temperature', tab: 'chat_behavior', label: 'Temperature', keywords: ['creativity', 'randomness', 'variation'] },
  { id: 'max_tokens', tab: 'chat_behavior', label: 'Max Output Tokens', keywords: ['limit', 'length', 'tokens', 'output'] },
  { id: 'streaming', tab: 'chat_behavior', label: 'Response Streaming', keywords: ['real-time', 'stream', 'live'] },
  { id: 'thinking_mode', tab: 'chat_behavior', label: 'Chain-of-Thought (Thinking Mode)', keywords: ['reasoning', 'deep', 'thought', 'cot'] },
  { id: 'thinking_budget', tab: 'chat_behavior', label: 'Reasoning Token Budget', keywords: ['reasoning', 'budget', 'tokens', 'thinking'] },
  { id: 'reasoning_disclosure_density', tab: 'chat_behavior', label: 'Reasoning Disclosure', keywords: ['reasoning', 'thinking', 'compact', 'balanced', 'detailed', 'display'] },
  { id: 'prompt_caching', tab: 'chat_behavior', label: 'Prompt Caching', keywords: ['cache', 'context', 'memory'] },
  { id: 'hardware_acceleration', tab: 'chat_behavior', label: 'Hardware Acceleration', keywords: ['gpu', 'compute', 'acceleration'] },
  // Audio
  { id: 'mic_device', tab: 'audio', label: 'Microphone Device', keywords: ['mic', 'input', 'voice'] },
  { id: 'speaker_device', tab: 'audio', label: 'Speaker Device', keywords: ['speaker', 'output', 'audio'] },
  { id: 'mic_gain', tab: 'audio', label: 'Microphone Gain', keywords: ['volume', 'sensitivity', 'gain'] },
  { id: 'stt_backend', tab: 'audio', label: 'STT Backend', keywords: ['speech', 'recognition', 'voice', 'stt'] },
  { id: 'tts_backend', tab: 'audio', label: 'TTS Backend', keywords: ['speech', 'synthesis', 'voice', 'tts'] },
  { id: 'vad_enabled', tab: 'audio', label: 'Voice Activity Detection', keywords: ['vad', 'voice', 'detection', 'silence'] },
  { id: 'system_sounds', tab: 'audio', label: 'System Sounds', keywords: ['sound', 'audio', 'notification', 'beep'] },
  // Providers
  { id: 'api_key', tab: 'providers', label: 'API Keys', keywords: ['key', 'api', 'authentication', 'credential'] },
  { id: 'provider_endpoint', tab: 'providers', label: 'Provider Endpoint', keywords: ['url', 'endpoint', 'host', 'server'] },
  { id: 'model_discovery', tab: 'providers', label: 'Model Discovery', keywords: ['models', 'discovery', 'scan', 'providers'] },
  // Models & Routing
  { id: 'routing_strategy', tab: 'models_routing', label: 'Routing Strategy', keywords: ['route', 'strategy', 'model', 'selection'] },
  { id: 'auto_escalate', tab: 'models_routing', label: 'Auto-Escalation', keywords: ['escalate', 'fallback', 'backup'] },
  // Agents
  { id: 'orchestrator_mode', tab: 'agents', label: 'Orchestrator Mode', keywords: ['orchestrator', 'auto', 'manual', 'mode'] },
  { id: 'agent_config', tab: 'agents', label: 'Agent Configuration', keywords: ['agent', 'config', 'settings'] },
  // Knowledge
  { id: 'rag_enabled', tab: 'knowledge', label: 'RAG Context', keywords: ['rag', 'retrieval', 'context', 'knowledge'] },
  { id: 'citations', tab: 'knowledge', label: 'Citation Display', keywords: ['citations', 'references', 'sources'] },
  { id: 'top_k', tab: 'knowledge', label: 'Context Retrieval Count (Top-K)', keywords: ['topk', 'retrieval', 'results', 'search'] },
  { id: 'search_strategy', tab: 'knowledge', label: 'Search Strategy', keywords: ['search', 'vector', 'hybrid', 'semantic'] },
  // Tools & Extensions
  { id: 'yolo_mode', tab: 'tools_extensions', label: 'YOLO Mode', keywords: ['yolo', 'auto', 'execute', 'dangerous'] },
  { id: 'terminal_limits', tab: 'tools_extensions', label: 'Terminal Execution Limits', keywords: ['terminal', 'limits', 'timeout', 'execution'] },
  // Performance
  { id: 'fps_limit', tab: 'performance', label: 'FPS Limit', keywords: ['fps', 'frame', 'rate', 'performance'] },
  { id: 'telemetry', tab: 'performance', label: 'Telemetry', keywords: ['telemetry', 'metrics', 'monitoring'] },
  { id: 'background_tasks', tab: 'performance', label: 'Background Tasks', keywords: ['background', 'tasks', 'processing'] },
];

export const CATEGORY_NAV_ITEMS: { id: SettingCategory; label: string; icon: string }[] = [
  { id: 'WORKSPACE', label: 'Workspace', icon: 'codicon:workspace' },
  { id: 'AI', label: 'AI', icon: 'codicon:hubot' },
  { id: 'SYSTEM', label: 'System', icon: 'codicon:vm' },
];

export const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: 'General', icon: 'codicon:settings-gear', category: 'WORKSPACE' },
  { id: 'appearance', label: 'Appearance', icon: 'codicon:color-mode', category: 'WORKSPACE', keywords: ['theme', 'dark', 'light', 'css', 'boot'] },
  { id: 'workspace', label: 'Workspace', icon: 'codicon:folder-opened', category: 'WORKSPACE', keywords: ['directory', 'path', 'security'] },
  
  { id: 'chat_behavior', label: 'Chat & Composer', icon: 'codicon:comment-discussion', category: 'AI', keywords: ['personality', 'streaming', 'temperature'] },
  { id: 'audio', label: 'Audio & Voice', icon: 'codicon:vm', category: 'AI', keywords: ['mic', 'speaker', 'stt', 'tts', 'vad'] },
  { id: 'providers', label: 'Providers', icon: 'codicon:cloud', category: 'AI', keywords: ['api', 'key', 'endpoint', 'model'] },
  { id: 'models_routing', label: 'Models & Routing', icon: 'codicon:organization', category: 'AI', keywords: ['model', 'routing', 'strategy'] },
  { id: 'agents', label: 'Agents', icon: 'codicon:robot', category: 'AI', keywords: ['agent', 'orchestrator', 'swarm'] },
  { id: 'knowledge', label: 'Knowledge & RAG', icon: 'codicon:database', category: 'AI', keywords: ['rag', 'search', 'embedding', 'retrieval'] },
  
  { id: 'tools_extensions', label: 'Tools & Extensions', icon: 'codicon:extensions', category: 'SYSTEM', keywords: ['mcp', 'plugins', 'terminal'] },
  { id: 'performance', label: 'Performance', icon: 'codicon:dashboard', category: 'SYSTEM', keywords: ['fps', 'telemetry', 'background'] },
  { id: 'updates', label: 'Updates', icon: 'codicon:sync', category: 'SYSTEM', keywords: ['update', 'version', 'changelog'] },
  { id: 'raw', label: 'Raw Settings', icon: 'codicon:json', category: 'SYSTEM', keywords: ['json', 'raw', 'config'] },
  { id: 'about', label: 'About', icon: 'codicon:info', category: 'SYSTEM', keywords: ['version', 'license', 'credits'] },
];

export const TAB_FIELD_MAP: Record<string, string[]> = {
  'general': ['workspace_path'],
  'appearance': ['theme', 'density', 'animations', 'gui_boot_enable', 'gui_css_injection'],
  'chat_behavior': ['persona_style', 'system_prompt', 'temperature', 'max_tokens', 'streaming', 'thinking_mode', 'thinking_budget', 'reasoning_disclosure_density', 'prompt_caching', 'hardware_acceleration'],
  'audio': ['mic_device', 'speaker_device', 'mic_gain', 'stt_backend', 'tts_backend', 'vad_enabled', 'system_sounds'],
  'providers': ['api_key', 'provider_endpoint', 'model_discovery'],
  'models_routing': ['routing_strategy', 'auto_escalate'],
  'agents': ['orchestrator_mode', 'agent_config'],
  'knowledge': ['rag_enabled', 'citations', 'top_k', 'search_strategy'],
  'tools_extensions': ['yolo_mode', 'terminal_limits'],
  'performance': ['fps_limit', 'telemetry', 'background_tasks'],
};

export type VoiceModel = {
    id: string;
    name: string;
    path: string;
    is_default: boolean;
};

export type HardwareInfo = {
    cpu_brand: string;
    cpu_cores: number;
    total_memory_gb: number;
    gpu_name?: string;
    vram_total_gb?: number;
    gpu_vendor: 'Nvidia' | 'Amd' | 'Intel' | 'Apple' | 'Unknown';
    has_cuda: boolean;
};

export type ToolInfo = {
    name: string;
    description: string;
    enabled: boolean;
};

export type TabId = 
    | 'general'
    | 'appearance' 
    | 'chat_behavior'
    | 'audio'
    | 'keyboard'
    | 'providers'
    | 'models_routing'
    | 'agents'
    | 'knowledge'
    | 'tools_extensions'
    | 'performance'
    | 'workspace'
    | 'updates'
    | 'raw'
    | 'about';

export type SettingCategory = 'WORKSPACE' | 'AI' | 'SYSTEM';

export type NavItem = {
    id: TabId;
    label: string;
    icon: string;
    category: SettingCategory;
    keywords?: string[];
};


export interface IntelligenceConfig {
  ragEnabled: boolean;
  citationsEnabled: boolean;
  topK: number;
  searchStrategy: 'vector' | 'hybrid' | 'semantic';
  strictGrounding: boolean;
  // Memory systems
  summarizationEnabled: boolean;
  summarizationModel: string;
  semanticRecallEnabled: boolean;
  maxRecalledMessages: number;
  driftDetectionEnabled: boolean;
  driftThreshold: number;
}

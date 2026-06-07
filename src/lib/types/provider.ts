export interface ModelInfo {
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    source?: 'local' | 'remote' | 'direct';
    provider?: string;
    contextWindow?: number;
    maxTokens?: number;
    capabilities?: string[];
    supportsReasoning?: boolean;
    reasoningConfigType?: 'none' | 'effort' | 'budget';
    state?: 'ready' | 'loading' | 'missing' | 'unloaded';
}

export interface ProviderInfo {
    key: string;
    name: string;
    description: string;
    isLocal: boolean;
    requiresKey: boolean;
    baseUrl?: string;
    category?: 'cloud' | 'local' | 'custom';
    apiKeyLink?: string;
    icon?: string;
}

export interface CustomProviderConfig {
    id: string;
    displayName: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
    customModels: ModelInfo[];
    headers?: Record<string, string>;
    error?: string;
}

export const PROVIDER_KEY_MAP: Record<string, string> = {
    openai: 'openaiApiKey',
    anthropic: 'anthropicApiKey',
    openrouter: 'openrouterApiKey',
    deepseek: 'deepseekApiKey',
    groq: 'groqApiKey',
    google: 'geminiApiKey',
    gemini: 'geminiApiKey',
    qwen: 'qwenApiKey',
    mistral: 'mistralApiKey',
    xai: 'xaiApiKey',
    kilocode: 'kilocodeApiKey',
    together: 'togetherApiKey',
    perplexity: 'perplexityApiKey',
    nvidia: 'nvidiaApiKey',
    ollama: 'ollamaBaseUrl',
    lmstudio: 'lmstudioBaseUrl',
    aihubmix: 'aihubmixApiKey',
};

export const PROVIDER_BASE_URL_MAP: Record<string, string> = {
    ollama: 'ollamaBaseUrl',
    lmstudio: 'lmstudioBaseUrl',
    nine_router: 'nineRouterBaseUrl',
    opencode: 'opencodeBaseUrl',
};



export const providerOrder: ProviderInfo[] = [
    {
        key: 'ollama',
        name: 'Ollama',
        description: 'Run large language models locally on your hardware.',
        isLocal: true,
        requiresKey: false,
        baseUrl: 'http://localhost:11434',
        category: 'local',
        icon: 'simple-icons:ollama'
    },
    {
        key: 'lmstudio',
        name: 'LM Studio',
        description: 'Local inference engine with OpenAI-compatible API.',
        isLocal: true,
        requiresKey: false,
        baseUrl: 'http://localhost:1234',
        category: 'local',
        icon: 'lucide:box'
    },
    {
        key: 'nine_router',
        name: '9Router',
        description: 'Offline-first local coding proxy and local orchestration gateway.',
        isLocal: true,
        requiresKey: false,
        baseUrl: 'http://localhost:20128/v1',
        category: 'local',
        icon: 'lucide:router'
    },
    {
        key: 'opencode',
        name: 'OpenCode Free',
        description: 'Direct OpenCode Zen free-model endpoint. No 9Router proxy and no account key required for discovery.',
        isLocal: false,
        requiresKey: false,
        baseUrl: 'https://opencode.ai/zen/v1',
        category: 'cloud',
        icon: 'lucide:code-2'
    },
    {
        key: 'openai',
        name: 'OpenAI',
        description: 'Industry standard models including GPT-4o and o1.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://platform.openai.com/api-keys',
        icon: 'simple-icons:openai'
    },
    {
        key: 'anthropic',
        name: 'Anthropic',
        description: 'Claude 4 Sonnet and Opus models known for safety and reasoning.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://console.anthropic.com/settings/keys',
        icon: 'simple-icons:anthropic'
    },
    {
        key: 'google',
        name: 'Google Gemini',
        description: 'Multimodal models with massive 1M+ context windows.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://aistudio.google.com/app/apikey',
        icon: 'simple-icons:googlegemini'
    },
    {
        key: 'groq',
        name: 'Groq',
        description: 'Ultra-fast inference for Llama and Mixtral models.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://console.groq.com/keys',
        icon: 'bxl:groq-ai'
    },
    {
        key: 'mistral',
        name: 'Mistral AI',
        description: 'Open-weight models from Europe like Codestral and Large.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://console.mistral.ai/api-keys/',
        icon: 'simple-icons:mistralai'
    },
    {
        key: 'openrouter',
        name: 'OpenRouter',
        description: 'Unified API for dozens of models across providers.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://openrouter.ai/settings/keys',
        icon: 'simple-icons:openrouter'
    },
    {
        key: 'deepseek',
        name: 'DeepSeek',
        description: 'High-performance Chinese models (V3, R1) with low cost.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://platform.deepseek.com/api_keys',
        icon: 'simple-icons:deepseek'
    },
    {
        key: 'xai',
        name: 'xAI (Grok)',
        description: 'Advanced reasoning models like Grok-1.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://console.x.ai/',
        icon: 'simple-icons:x'
    },
    {
        key: 'together',
        name: 'Together AI',
        description: 'Global cloud for running open-source AI models.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://api.together.xyz/settings/api-keys',
        icon: 'simple-icons:together'
    },
    {
        key: 'perplexity',
        name: 'Perplexity',
        description: 'Online LLMs specialized in search and citations.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://www.perplexity.ai/settings/api',
        icon: 'simple-icons:perplexity'
    },
    {
        key: 'nvidia',
        name: 'NVIDIA NIM',
        description: 'NVIDIA-hosted inference for open-source models.',
        isLocal: false,
        requiresKey: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        category: 'cloud',
        apiKeyLink: 'https://build.nvidia.com/explore/reasoning',
        icon: 'simple-icons:nvidia'
    },
    {
        key: 'qwen',
        name: 'Qwen (DashScope)',
        description: 'Alibaba Cloud high-performance models (Qwen-Max/Plus).',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://dashscope.console.aliyun.com/apiKey',
        icon: 'simple-icons:alibabacloud'
    },
    {
        key: 'kilocode',
        name: 'Kilo Gateway',
        description: 'Enterprise 9Router proxy for air-gapped operations.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        icon: 'lucide:shield-check'
    },
    {
        key: 'aihubmix',
        name: 'AIHubMix',
        description: 'Advanced all-in-one model gateway for premium multimodal models.',
        isLocal: false,
        requiresKey: true,
        category: 'cloud',
        apiKeyLink: 'https://aihubmix.com/dashboard',
        icon: 'lucide:sparkles'
    }
];


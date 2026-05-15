import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    openai: <WorkbenchIcon name="simple-icons:openai" size={16} />,
    anthropic: <WorkbenchIcon name="simple-icons:anthropic" size={16} />,
    groq: <WorkbenchIcon name="lucide:zap" size={16} />,
    google: <WorkbenchIcon name="simple-icons:googlegemini" size={16} />,
    gemini: <WorkbenchIcon name="simple-icons:googlegemini" size={16} />,
    openrouter: <WorkbenchIcon name="simple-icons:openrouter" size={16} />,
    ollama: <WorkbenchIcon name="simple-icons:ollama" size={16} />,
    mistral: <WorkbenchIcon name="simple-icons:mistralai" size={16} />,
    xai: <WorkbenchIcon name="simple-icons:x" size={16} />,
    deepseek: <WorkbenchIcon name="simple-icons:deepseek" size={16} />,
};

export interface EmbeddingHealthStatus {
    healthy: boolean;
    provider: string;
    model: string;
    base_url: string;
    error?: string | null;
}

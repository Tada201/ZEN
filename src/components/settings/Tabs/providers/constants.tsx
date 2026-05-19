import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    openai: <WorkbenchIcon name="simple-icons:openai" size={16} />,
    anthropic: <WorkbenchIcon name="simple-icons:anthropic" size={16} />,
    groq: <WorkbenchIcon name="bxl:groq-ai" size={16} />,
    google: <WorkbenchIcon name="simple-icons:googlegemini" size={16} />,
    gemini: <WorkbenchIcon name="simple-icons:googlegemini" size={16} />,
    openrouter: <WorkbenchIcon name="simple-icons:openrouter" size={16} />,
    ollama: <WorkbenchIcon name="simple-icons:ollama" size={16} />,
    mistral: <WorkbenchIcon name="simple-icons:mistralai" size={16} />,
    xai: <WorkbenchIcon name="simple-icons:x" size={16} />,
    deepseek: <WorkbenchIcon name="simple-icons:deepseek" size={16} />,
    qwen: <WorkbenchIcon name="simple-icons:alibabacloud" size={16} />,
    lmstudio: (
        <svg fill="currentColor" fillRule="evenodd" width={16} height={16} style={{ flex: 'none', lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.84 2a1.273 1.273 0 100 2.547h14.107a1.273 1.273 0 100-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H22.04a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h14.106a1.274 1.274 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H15.38a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h14.106a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h9.698a1.273 1.273 0 100-2.547h-9.698z" fillOpacity=".3" />
            <path d="M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z" />
        </svg>
    ),
    kilocode: (
        <svg fill="currentColor" fillRule="evenodd" width={16} height={16} style={{ flex: 'none', lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0v24h24V0H0zm22.222 22.222H1.778V1.778h20.444v20.444zm-7.555-4.964h2.222v1.778h-2.794L12.89 17.83v-2.794h1.778v2.222zm4 0h-1.778v-2.222h-2.222v-1.778h2.793l1.207 1.207v2.793zm-7.556-2.591H9.333v-1.778h1.778v1.778zm-5.778-1.778h1.778v4h4v1.778H6.54L5.333 17.46V12.89zm13.334-3.556v1.778h-5.778V9.333h1.987V7.111h-1.987V5.333h2.558l1.206 1.207v2.793h2.014zm-11.556-2h2.222l1.778 1.778v2H9.333v-2H7.111v2H5.333V5.333h1.778v2zm4 0H9.333v-2H1.778v2zm4 0H9.333v-2h1.778v2z" />
        </svg>
    ),
    nine_router: <WorkbenchIcon name="lucide:router" size={16} />,
    aihubmix: <WorkbenchIcon name="lucide:sparkles" size={16} />
};

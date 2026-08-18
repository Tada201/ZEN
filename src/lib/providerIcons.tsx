import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { cn } from '@/lib/utils/style';

/**
 * Single source of truth for provider glyphs, shared by the composer model
 * selector and the settings provider gallery so the two never drift.
 * Keys are normalized provider ids (lowercased, separators stripped).
 */
const ICON_NAMES: Record<string, string> = {
  openai: 'simple-icons:openai',
  anthropic: 'simple-icons:anthropic',
  google: 'simple-icons:googlegemini',
  gemini: 'simple-icons:googlegemini',
  googlegemini: 'simple-icons:googlegemini',
  groq: 'bxl:groq-ai',
  xai: 'simple-icons:x',
  mistral: 'simple-icons:mistralai',
  mistralai: 'simple-icons:mistralai',
  nvidia: 'simple-icons:nvidia',
  deepseek: 'simple-icons:deepseek',
  ollama: 'simple-icons:ollama',
  openrouter: 'simple-icons:openrouter',
  qwen: 'simple-icons:alibabacloud',
  together: 'simple-icons:together',
  perplexity: 'simple-icons:perplexity',
  mimo: 'simple-icons:xiaomi',
  ninerouter: 'lucide:router',
  opencode: 'lucide:code-2',
};

function normalize(provider: string): string {
  return provider.trim().toLowerCase().replace(/[_\s-]+/g, '');
}

// Providers with bespoke marks that have no faithful Iconify glyph.
const LMSTUDIO_PATHS = (
  <>
    <path fillOpacity=".3" d="M2.84 2a1.273 1.273 0 100 2.547h14.107a1.273 1.273 0 100-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H22.04a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h14.106a1.274 1.274 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H15.38a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h14.106a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h9.698a1.273 1.273 0 100-2.547h-9.698z" />
    <path d="M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z" />
  </>
);
const KILO_PATH = 'M0 0v24h24V0H0zm22.222 22.222H1.778V1.778h20.444v20.444zm-7.555-4.964h2.222v1.778h-2.794L12.89 17.83v-2.794h1.778v2.222zm4 0h-1.778v-2.222h-2.222v-1.778h2.793l1.207 1.207v2.793zm-7.556-2.591H9.333v-1.778h1.778v1.778zm-5.778-1.778h1.778v4h4v1.778H6.54L5.333 17.46V12.89zm13.334-3.556v1.778h-5.778V9.333h1.987V7.111h-1.987V5.333h2.558l1.206 1.207v2.793h2.014zm-11.556-2h2.222l1.778 1.778v2H9.333v-2H7.111v2H5.333V5.333h1.778v2zm4 0H9.333v-2H1.778v2zm4 0H9.333v-2h1.778v2z';

export interface ProviderIconProps {
  provider: string;
  /** Numeric size for settings surfaces; selector surfaces size via className. */
  size?: number;
  className?: string;
}

export function ProviderIcon({ provider, size, className }: ProviderIconProps) {
  const key = normalize(provider);
  const dim = size ? { width: size, height: size } : undefined;

  // A user-configured custom provider can supply its own Iconify name; it wins
  // over the built-in table so the selector matches what the user set.
  const customIcon = useSettingsStore((s) =>
    s.customProviders.find((cp) => cp.id === provider || normalize(cp.id) === key)?.icon,
  )?.trim();
  if (customIcon) {
    return <WorkbenchIcon name={customIcon} size={size ?? 16} className={cn('shrink-0', className)} />;
  }

  if (key === 'lmstudio') {
    return (
      <svg {...dim} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={cn('inline-block shrink-0', className)}>
        {LMSTUDIO_PATHS}
      </svg>
    );
  }
  if (key === 'kilocode' || key === 'kilo' || key === 'kilogateway') {
    return (
      <svg {...dim} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={cn('inline-block shrink-0', className)}>
        <path d={KILO_PATH} />
      </svg>
    );
  }

  return <WorkbenchIcon name={ICON_NAMES[key] ?? 'lucide:cpu'} size={size ?? 16} className={cn('shrink-0', className)} />;
}

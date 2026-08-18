import { ProviderIcon } from '@/lib/providerIcons';

/**
 * Provider glyphs for the settings gallery. Rendered through the shared
 * ProviderIcon so the settings cards and the composer model selector never
 * diverge. Keyed by provider id / key.
 */
const KEYS = [
  'openai', 'anthropic', 'groq', 'google', 'gemini', 'openrouter', 'ollama',
  'mistral', 'xai', 'deepseek', 'qwen', 'lmstudio', 'kilocode', 'nine_router',
  'opencode', 'together', 'perplexity', 'nvidia', 'mimo',
] as const;

export const PROVIDER_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
  KEYS.map((key) => [key, <ProviderIcon key={key} provider={key} size={16} />]),
);

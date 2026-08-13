import { Icon } from '@iconify/react';
import { cn } from '@/lib/utils';

export function getProviderIconInfo(provider: string) {
  const normalizedProvider = provider.trim().toLowerCase().replace(/[_\s-]+/g, '');
  switch (normalizedProvider) {
    case 'openai': return { icon: "simple-icons:openai", color: 'text-emerald-500' };
    case 'anthropic': return { icon: "simple-icons:anthropic", color: 'text-orange-500' };
    case 'google':
    case 'gemini':
    case 'googlegemini': return { icon: "logos:google-gemini", color: 'text-primary' };
    case 'groq': return { icon: "simple-icons:groq", color: 'text-orange-400' };
    case 'xai': return { icon: "simple-icons:x", color: 'text-foreground dark:text-foreground' };
    case 'mistral': return { icon: "simple-icons:mistral", color: 'text-warning' };
    case 'nvidia': return { icon: "simple-icons:nvidia", color: 'text-emerald-600' };
    case 'kilocode': return { icon: "simple-icons:visualstudiocode", color: 'text-cyan-500' };
    case 'deepseek': return { icon: "simple-icons:deepseek", color: 'text-blue-600' };
    case 'ollama': return { icon: "simple-icons:ollama", color: 'text-muted-foreground' };
    case 'lmstudio': return { icon: "simple-icons:lmstudio", color: 'text-purple-500' };
    case 'opencode': return { icon: "lucide:code-2", color: 'text-emerald-500' };
    default: return { icon: "lucide:zap", color: 'text-muted-foreground' };
  }
}

export function ProviderIcon({ provider, className }: { provider: string, className?: string }) {
  const info = getProviderIconInfo(provider);
  return <Icon aria-hidden="true" icon={info.icon} className={cn("inline-block shrink-0", className, info.color)} />;
}

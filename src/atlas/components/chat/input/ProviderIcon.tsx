import { Icon } from '@iconify/react';
import { cn } from '@/lib/utils';

export function getProviderIconInfo(provider: string) {
  switch (provider.toLowerCase()) {
    case 'openai': return { icon: "simple-icons:openai", color: 'text-emerald-500' };
    case 'anthropic': return { icon: "simple-icons:anthropic", color: 'text-orange-500' };
    case 'google': return { icon: "logos:google-gemini", color: 'text-blue-500' };
    case 'groq': return { icon: "simple-icons:groq", color: 'text-orange-400' };
    case 'xai': return { icon: "simple-icons:x", color: 'text-zinc-900 dark:text-zinc-100' };
    case 'mistral': return { icon: "simple-icons:mistral", color: 'text-amber-500' };
    case 'nvidia': return { icon: "simple-icons:nvidia", color: 'text-emerald-600' };
    case 'kilocode': return { icon: "simple-icons:visualstudiocode", color: 'text-cyan-500' };
    case 'deepseek': return { icon: "simple-icons:deepseek", color: 'text-blue-600' };
    case 'ollama': return { icon: "simple-icons:ollama", color: 'text-zinc-500' };
    case 'lmstudio': return { icon: "simple-icons:lmstudio", color: 'text-purple-500' };
    default: return { icon: "lucide:zap", color: 'text-zinc-400' };
  }
}

export function ProviderIcon({ provider, className }: { provider: string, className?: string }) {
  const info = getProviderIconInfo(provider);
  return <Icon icon={info.icon} className={cn(className, info.color)} />;
}

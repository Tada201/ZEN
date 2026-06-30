import { memo } from 'react';
import { Sparkles, Compass, Eye, Image as ImageIcon, Paintbrush, Monitor } from 'lucide-react';

export interface StylePreset {
  id: string;
  name: string;
  prompt: string;
  icon: any;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'photorealistic',
    name: 'Photorealistic',
    prompt: 'highly detailed photorealistic, professional photography, 8k resolution, photorealistic rendering, dramatic lighting, sharp focus',
    icon: Eye
  },
  {
    id: 'anime',
    name: 'Anime & Manga',
    prompt: 'beautiful anime aesthetic, studio ghibli style, vibrant colors, detailed line art, hand-drawn background, masterwork',
    icon: Sparkles
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    prompt: 'cyberpunk style, glowing neon signboards, dark wet city streets, high tech low life, cinematic volumetric fog, retro-futurism',
    icon: Compass
  },
  {
    id: '3d-render',
    name: '3D Render',
    prompt: 'premium 3D clay render, cute toy style, octane render, vivid colors, smooth surfaces, isometric composition, soft shadows, blender style',
    icon: ImageIcon
  },
  {
    id: 'oil-painting',
    name: 'Oil Painting',
    prompt: 'classical oil painting style, visible heavy brushstrokes, textured canvas, warm rich color palette, fine art masterpiece, dramatic chiaroscuro',
    icon: Paintbrush
  },
  {
    id: 'minimalist',
    name: 'Minimalist Vector',
    prompt: 'flat vector illustration, clean lines, flat colors, minimalist design, modern typography, geometric shapes, aesthetic simplicity',
    icon: Monitor
  }
];

interface ImagePresetStripProps {
  onSelectPreset: (presetPrompt: string) => void;
  isImageGenEnabled: boolean;
}

export const ImagePresetStrip = memo(({
  onSelectPreset,
  isImageGenEnabled
}: ImagePresetStripProps) => {
  if (!isImageGenEnabled) return null;

  return (
    <div className="w-full overflow-x-auto scrollbar-none flex items-center gap-2 px-1 py-1 mb-1 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-1.5 shrink-0 pr-2 mr-2 border-r border-zinc-500/10 dark:border-white/5">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 select-none">Presets</span>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {STYLE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700/50 hover:bg-zinc-300 dark:hover:bg-zinc-750 text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 hover:text-black dark:hover:text-white shadow-sm transition-all duration-200 whitespace-nowrap active:scale-95"
            >
              <Icon className="w-3 h-3 text-zinc-600 dark:text-zinc-300" />
              {preset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
});

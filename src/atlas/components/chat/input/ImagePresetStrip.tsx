import { memo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Compass, Eye, Image as ImageIcon, Paintbrush, Monitor } from 'lucide-react';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';

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
  const reducedMotion = useReducedMotion();
  if (!isImageGenEnabled) return null;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
      className="flex min-w-0 w-full items-center gap-1.5 overflow-x-auto scrollbar-none px-1 py-0.5 mb-0.5"
    >
      <div className="composer-toolbar flex items-center gap-1 mr-1.5 shrink-0 border-r pr-1.5">
        <Sparkles className="w-3.5 h-3.5 text-warning" />
        <span className="text-[11px] font-semibold text-muted-foreground select-none">Presets</span>
      </div>
      <div className="flex min-w-max items-center gap-1.5">
        {STYLE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.prompt)}
              className="composer-chip px-2 py-1 text-[11px] font-semibold whitespace-nowrap shadow-sm transition-colors"
            >
              <Icon className="h-3 w-3 text-muted-foreground" />
              {preset.name}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
});

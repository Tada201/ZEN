import { useSettingsStore } from '@/lib/stores/useSettingsStore';

/**
 * WorkspaceBackground - A modular background component that renders solid backdrops,
 * custom vignette grids, and the user's custom blurred wallpaper dynamically.
 */
export function WorkspaceBackground() {
  const backgroundImageUrl = useSettingsStore(s => s.backgroundImageUrl ?? "");
  const backgroundOpacity = useSettingsStore(s => s.backgroundOpacity ?? 0.15);
  const backgroundBlur = useSettingsStore(s => s.backgroundBlur ?? 0);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none w-full h-full overflow-hidden select-none">
      {/* Deep baseline solid color */}
      <div className="absolute inset-0 bg-[#060608]" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-vignette-grid opacity-[0.25] mix-blend-overlay" />

      {/* User Custom Wallpaper */}
      {backgroundImageUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-500 ease-in-out [will-change:transform,opacity,filter]"
          style={{ 
            backgroundImage: `url(${backgroundImageUrl})`,
            opacity: backgroundOpacity,
            filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
            // Scale and translate3d to force dedicated GPU composite layer isolation and eliminate edge bleeds
            transform: backgroundBlur > 0 ? 'scale(1.03) translate3d(0,0,0)' : 'scale(1.01) translate3d(0,0,0)',
          }}
        />
      )}
    </div>
  );
}

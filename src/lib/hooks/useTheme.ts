import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

/**
 * Manages theme (dark/light/tactical) and style modes (glass/flat) on the html element.
 */
export function useTheme() {
  const { theme, styleMode, density } = useUIStore();

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove existing theme/style classes
    root.classList.remove('light', 'dark', 'tactical');
    
    // Add current theme
    if (theme === 'tactical') {
      root.classList.add('dark', 'tactical'); // Tactical is a dark variant
    } else {
      root.classList.add(theme);
    }

    // Set attributes for style modes and density
    root.setAttribute('data-style', styleMode);
    root.setAttribute('data-density', density);
    
    // Set theme color for browser/system
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#ffffff' : '#0e0f11');
    }
  }, [theme, styleMode, density]);
}

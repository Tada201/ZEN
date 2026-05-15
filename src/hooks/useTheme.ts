import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

export function useTheme() {
    const themeId = useSettingsStore(s => s.themeId ?? 'dark');
    const customThemeSource = useSettingsStore(s => s.customThemeSource);
    const customCssEnabled = useSettingsStore(s => s.customCssEnabled ?? false);

    useEffect(() => {
        const body = document.body;
        const classes = body.className.split(' ').filter(c => !c.startsWith('zen-theme-'));
        body.className = classes.join(' ');
        body.classList.add(`zen-theme-${themeId || 'dark'}`);

        let styleTag = document.getElementById('zen-dynamic-theme') as HTMLStyleElement;
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'zen-dynamic-theme';
            document.head.appendChild(styleTag);
        }

        let combinedCss = '';
        if (customCssEnabled && customThemeSource) {
            combinedCss += `/* Custom CSS Source */\n${customThemeSource}\n`;
        }
        styleTag.textContent = combinedCss;
    }, [themeId, customCssEnabled, customThemeSource]);
}
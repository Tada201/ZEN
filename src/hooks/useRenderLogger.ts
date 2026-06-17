import { useRef, useEffect } from 'react';

/**
 * A custom hook to count and log component re-renders.
 * Helps identify React components re-rendering unnecessarily.
 */
export function useRenderLogger(componentName: string, propsToTrack?: Record<string, any>) {
  const renderCount = useRef(0);
  const prevProps = useRef<Record<string, any> | undefined>(propsToTrack);

  renderCount.current += 1;

  useEffect(() => {
    const changes: Record<string, { prev: any; next: any }> = {};
    if (propsToTrack && prevProps.current) {
      Object.keys(propsToTrack).forEach((key) => {
        if (prevProps.current![key] !== propsToTrack[key]) {
          changes[key] = {
            prev: prevProps.current![key],
            next: propsToTrack[key],
          };
        }
      });
    }

    if (Object.keys(changes).length > 0) {
      console.log(
        `%c[RenderLogger] %c${componentName} re-rendered (Count: ${renderCount.current}) due to prop changes:`,
        'color: #10b981; font-weight: bold;',
        'color: #3b82f6;',
        changes
      );
    } else {
      console.log(
        `%c[RenderLogger] %c${componentName} re-rendered (Count: ${renderCount.current}) - No tracked prop changes.`,
        'color: #10b981; font-weight: bold;',
        'color: #9ca3af;'
      );
    }

    prevProps.current = propsToTrack;
  });
}

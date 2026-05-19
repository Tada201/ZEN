import { useState, useEffect } from "react";

export function useOverflow(containerRef: React.RefObject<HTMLElement | null>) {
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      setIsOverflowing(container.scrollWidth > container.clientWidth);
    };

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);
    
    checkOverflow(); // Initial check

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  return isOverflowing;
}

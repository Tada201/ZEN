import { useEffect, useRef } from "react";
import { browserPreviewApi } from "@/api/browserPreviewApi";
import { IS_TAURI } from "@/api/tauriClient";

/**
 * Positions the native WebView2 preview over a placeholder element and keeps
 * its bounds in sync. The embedded webview paints over the DOM (ignores React
 * z-index/overflow), so the host element is a transparent rect whose geometry
 * we mirror to Rust on every resize/scroll/layout change. Attaches on mount,
 * detaches on unmount.
 */
export function useWebviewBounds(
  hostRef: React.RefObject<HTMLElement | null>,
  url: string,
  allowLoopback: boolean,
  active: boolean,
) {
  // Latest url/loopback without re-subscribing the observers on every change.
  const navRef = useRef({ url, allowLoopback });
  navRef.current = { url, allowLoopback };
  const attachedRef = useRef(false);

  useEffect(() => {
    if (!IS_TAURI || !active) return;
    const host = hostRef.current;
    if (!host) return;

    let raf = 0;
    const pushBounds = () => {
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const bounds = { x: r.left, y: r.top, width: r.width, height: r.height };
      if (!attachedRef.current) {
        attachedRef.current = true;
        void browserPreviewApi
          .attach(bounds, navRef.current.url, navRef.current.allowLoopback)
          .catch(() => { attachedRef.current = false; });
      } else {
        void browserPreviewApi.setBounds(bounds).catch(() => {});
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pushBounds);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
      attachedRef.current = false;
      void browserPreviewApi.detach().catch(() => {});
    };
    // Re-attach when the panel toggles active or the host node changes.
  }, [hostRef, active]);

  // Hide (not detach) when the panel is present but not the active surface —
  // e.g. an overlay/modal opens over it.
  useEffect(() => {
    if (!IS_TAURI) return;
    if (!active && attachedRef.current) {
      void browserPreviewApi.hide().catch(() => {});
      attachedRef.current = false;
    }
  }, [active]);
}

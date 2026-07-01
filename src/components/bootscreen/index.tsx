import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import "./bootReveal.css";

/**
 * BootScreen — a PASSIVE REVEAL OVERLAY.
 *
 * Per the canonical Tauri v2 splash pattern (https://v2.tauri.app/learn/splashscreen/),
 * Rust owns the splash → main handoff via `SetupFlags`:
 *   * `backend_ready`  — set in `lib.rs` when `core_complete` becomes true.
 *   * `frontend_ready` — set when the React `useAppInit` hook finishes and
 *                        calls `systemApi.setComplete("frontend")`.
 * When both are true, Rust's `perform_handoff` closes the native splash and
 * shows the main window. By the time the user sees BootScreen, both signals
 * have already arrived; BootScreen does no gating of its own.
 *
 * BootScreen's only jobs are:
 *   1. Respect the user's `bootEnabled` setting (skip entirely if false).
 *   2. Play the wireframe assembly + cover-mask reveal animation.
 *   3. Call `onComplete` after the reveal so WorkspaceApp can take over.
 *
 * If the user disabled the boot screen in settings, this component returns
 * null immediately and the main window's WorkspaceApp mounts without any
 * reveal overlay.
 */
export function BootScreen({ onComplete }: { onComplete: () => void }) {
  // Stable ref for onComplete to prevent timer resets from inline arrow functions
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const done = useCallback(() => onCompleteRef.current(), []);

  const bootEnabled = useSettingsStore((s) => s.bootEnabled ?? true);

  // Dynamic layout panel states from store
  const { sidebarOpen, rightPanelOpen } = useUIStore();

  // Read right panel width from localStorage (just like WorkspaceLayout)
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zen_right_panel_width");
      if (saved) {
        setRightPanelWidth(parseInt(saved, 10));
      }
    }
  }, [rightPanelOpen]);

  // Panel visibility during wireframe assembly phase (appear one by one)
  const [panelVisible, setPanelVisible] = useState({
    leftSidebar: false,
    middleChat: false,
    premiumInput: false,
    rightSidebar: false,
    bottomFooter: false,
  });

  // Reveal animation state (purely cosmetic). CSS handles the choreography
  // — these booleans flip on a fixed schedule after mount.
  const [revealed, setRevealed] = useState(false);
  const [wireframeFaded, setWireframeFaded] = useState(false);
  const [parentOpacity, setParentOpacity] = useState(1);

  // Skip boot screen if disabled in settings
  useEffect(() => {
    if (!bootEnabled) {
      done();
    }
  }, [bootEnabled, done]);

  // Staggered wireframe assembly — panels appear one by one
  useEffect(() => {
    if (!bootEnabled) return;
    const delays = [
      setTimeout(() => setPanelVisible(v => ({...v, leftSidebar: true})), 100),
      setTimeout(() => setPanelVisible(v => ({...v, middleChat: true})), 500),
      setTimeout(() => setPanelVisible(v => ({...v, premiumInput: true})), 900),
      setTimeout(() => setPanelVisible(v => ({...v, rightSidebar: true})), 1300),
      setTimeout(() => setPanelVisible(v => ({...v, bottomFooter: true})), 1700),
    ];
    return () => delays.forEach(clearTimeout);
  }, [bootEnabled]);

  // Reveal choreography. Runs on mount, regardless of any readiness signal —
  // the Rust side has already determined main should be visible by the time
  // the user sees this overlay. Total: ~4400ms.
  //   t=0     : mount → wireframe panels already assembling
  //   t=250   : cover wipe starts (CSS data-state flips to "active")
  //   t=2800  : wrapper opacity 1→0 cross-fade begins (covers mostly gone)
  //   t=3200  : wireframe shimmer cross-fades out
  //   t=4400  : BootScreen unmounts, WorkspaceApp takes over
  useEffect(() => {
    if (!bootEnabled) return;
    const start = setTimeout(() => setRevealed(true), 250);
    const fade = setTimeout(() => setParentOpacity(0), 2800);
    const wireframeFade = setTimeout(() => setWireframeFaded(true), 3200);
    const doneTimer = setTimeout(() => done(), 4400);
    return () => {
      clearTimeout(start);
      clearTimeout(fade);
      clearTimeout(wireframeFade);
      clearTimeout(doneTimer);
    };
  }, [bootEnabled, done]);

  if (!bootEnabled) return null;

  // Layout calculations matching WorkspaceLayout and SecondaryActivityBar
  const leftSidebarWidth = sidebarOpen ? 260 : 48;
  const secondaryActivityBarWidth = 48;
  const rightSidebarWidth = rightPanelOpen ? rightPanelWidth + secondaryActivityBarWidth : secondaryActivityBarWidth;
  const footerHeight = 28;
  const inputAreaHeight = 140;

  // Helper: cover (mask) props. Per-variant choreography lives in CSS
  // (.boot-cover[data-variant]); --boot-delay staggers panel start.
  // `pos` provides absolute positioning (left/top/width/height/right/bottom).
  const coverProps = (variant: string, delayMs: number, pos: React.CSSProperties) => ({
    className: "boot-cover",
    "data-variant": variant,
    "data-state": revealed ? "active" : "pending",
    style: { ...pos, ["--boot-delay" as string]: `${delayMs}ms` } as React.CSSProperties,
  });

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden select-none pointer-events-none"
      style={{
        backgroundColor: "hsl(var(--background))",
        opacity: parentOpacity,
        transition: "opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >

      {/* Single-line scanline — synced with the cover-mask reveal.
       * One-shot sweep (no infinite loop), duration matches the longest
       * cover animation (bloom 850ms). Remounts via key when revealed
       * flips so the animation restarts in lock-step with the mask. */}
      <style>{`
        .shimmer-item {
          position: relative;
          overflow: hidden;
          background: hsl(var(--foreground) / 0.03) !important;
          border: 1px solid hsl(var(--foreground) / 0.2) !important;
        }
        .absolute.shimmer-item {
          position: absolute;
        }
        .shimmer-item-circle {
          border-radius: 50% !important;
        }

        /* ChatGPT-style placeholder shimmer on individual skeleton items */
        @keyframes boot-item-shimmer {
          0%   { transform: translateX(-150%); }
          100% { transform: translateX(150%); }
        }
        .shimmer-item::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-150%);
          background: linear-gradient(
            90deg,
            hsl(var(--foreground) / 0) 0%,
            hsl(var(--foreground) / 0.04) 30%,
            hsl(var(--foreground) / 0.18) 50%,
            hsl(var(--foreground) / 0.04) 70%,
            hsl(var(--foreground) / 0) 100%
          );
          animation: boot-item-shimmer 1.8s infinite linear;
        }

        @keyframes boot-scanline-sweep {
          0%   { transform: translateY(0);      opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        .boot-scanline {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            hsl(var(--foreground) / 0) 0%,
            hsl(var(--foreground) / 0.55) 50%,
            hsl(var(--foreground) / 0) 100%
          );
          pointer-events: none;
          z-index: 5;
          animation: boot-scanline-sweep 850ms cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }
      `}</style>
      <div className="boot-scanline" key={revealed ? "on" : "off"} />



      {/* 
        ========================================================================
        STAGGERED WIREFRAME ASSEMBLY — panels appear one by one
        ========================================================================
      */}

      {/* 1. Left Sidebar — actual UI: SessionSidebar (260px expanded / 48px collapsed) */}
      <div
        {...coverProps("wipe-down", 0, {
          left: 0,
          top: 0,
          width: `${leftSidebarWidth}px`,
          height: `calc(100vh - ${footerHeight}px)`,
        })}
      />
      <div
        className="absolute left-0 top-0 overflow-hidden boot-wireframe"
        data-state={revealed ? "active" : "pending"}
        style={{ width: `${leftSidebarWidth}px`, height: `calc(100vh - ${footerHeight}px)`, opacity: panelVisible.leftSidebar && !wireframeFaded ? 1 : 0, transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {sidebarOpen ? (
          <>
             {/* Header: "Cases & Investigations" and side icons */}
             <div data-inner="sb-header" className="absolute" style={{ left: 0, right: 0, top: 12, height: 32 }}>
               <div className="absolute shimmer-item" style={{ left: 16, top: 18, width: 120, height: 7, borderRadius: 2 }} />
               <div className="absolute shimmer-item" style={{ right: 36, top: 14, width: 14, height: 14, borderRadius: 3 }} />
               <div className="absolute shimmer-item" style={{ right: 12, top: 14, width: 14, height: 14, borderRadius: 3 }} />
             </div>

             {/* Search input */}
             <div data-inner="sb-search" className="absolute shimmer-item" style={{ left: 10, right: 10, top: 52, height: 28, borderRadius: 6 }}>
               <div className="shimmer-item shimmer-item-circle" style={{ position: "absolute", left: 8, top: "50%", marginTop: -4, width: 9, height: 9 }} />
               <div className="shimmer-item" style={{ position: "absolute", left: 24, top: "50%", marginTop: -3, width: 62, height: 5, borderRadius: 2 }} />
             </div>

             {/* New Chat button */}
             <div data-inner="sb-newchat" className="absolute shimmer-item" style={{ left: 10, right: 10, top: 92, height: 30, borderRadius: 6 }}>
               <div className="shimmer-item shimmer-item-circle" style={{ position: "absolute", left: 10, top: "50%", marginTop: -4, width: 8, height: 8 }} />
               <div className="shimmer-item" style={{ position: "absolute", left: 26, top: "50%", marginTop: -3, width: 45, height: 5, borderRadius: 2 }} />
             </div>

             {/* TODAY section */}
             <div data-inner="sb-today" className="absolute" style={{ left: 8, right: 8, top: 142, height: 48 }}>
               <div className="absolute shimmer-item" style={{ left: 4, top: 2, width: 40, height: 5, borderRadius: 2 }} />
               <div className="absolute shimmer-item" style={{ left: 0, right: 0, top: 16, height: 32, borderRadius: 6 }}>
                 <div className="shimmer-item" style={{ position: "absolute", left: 10, top: "50%", marginTop: -3, width: 50, height: 5, borderRadius: 2 }} />
               </div>
             </div>

             {/* THIS WEEK section */}
             <div data-inner="sb-week" className="absolute" style={{ left: 8, right: 8, top: 208, height: 48 }}>
               <div className="absolute shimmer-item" style={{ left: 4, top: 2, width: 45, height: 5, borderRadius: 2 }} />
               <div className="absolute shimmer-item" style={{ left: 0, right: 0, top: 16, height: 32, borderRadius: 6 }}>
                 <div className="shimmer-item" style={{ position: "absolute", left: 10, top: "50%", marginTop: -3, width: 50, height: 5, borderRadius: 2 }} />
                 <div className="shimmer-item" style={{ position: "absolute", right: 12, top: "50%", marginTop: -2, width: 10, height: 3, borderRadius: 1 }} />
               </div>
             </div>

             {/* Bottom toolbar (h-10, border-t) */}
             <div data-inner="sb-toolbar" className="absolute" style={{ left: 0, right: 0, bottom: 0, height: 40, borderTop: "1px solid hsl(var(--foreground) / 0.25)" }}>
               <div className="shimmer-item" style={{ position: "absolute", left: 12, top: "50%", marginTop: -8, width: 14, height: 14, borderRadius: 3 }} />
               <div className="shimmer-item" style={{ position: "absolute", left: 32, top: "50%", marginTop: -3, width: 28, height: 5, borderRadius: 2 }} />
               <div className="shimmer-item" style={{ position: "absolute", left: 78, top: "50%", marginTop: -8, width: 14, height: 14, borderRadius: 3 }} />
               <div className="shimmer-item" style={{ position: "absolute", left: 98, top: "50%", marginTop: -3, width: 30, height: 5, borderRadius: 2 }} />
             </div>
          </>
        ) : (
          /* Collapsed: icon-only bar (48px) */
          <>
            <div data-inner="sb-toolbar" style={{ position: "absolute", left: "50%", top: 14, marginLeft: -9, width: 18, height: 18, borderRadius: 4, border: "1px solid hsl(var(--foreground) / 0.35)" }} />
            {[60, 106, 152, 198].map((top, i) => (
              <div data-inner="sb-toolbar" key={`l${i}`} className="absolute" style={{ left: "50%", top, marginLeft: -9, width: 18, height: 18, borderRadius: 4, border: "1px solid hsl(var(--foreground) / 0.35)" }} />
            ))}
            <div data-inner="sb-toolbar" style={{ position: "absolute", left: "50%", top: `calc(100vh - ${footerHeight}px - 46px)`, marginLeft: -9, width: 18, height: 18, borderRadius: 4, border: "1px solid hsl(var(--foreground) / 0.35)" }} />
          </>
        )}
      </div>

      {/* 2. Middle Chat — messages centered in max-w-[800px] */}
      <div
        {...coverProps("bloom", 250, {
          left: `${leftSidebarWidth}px`,
          right: `${rightSidebarWidth}px`,
          top: 0,
          height: `calc(100vh - ${footerHeight}px - ${inputAreaHeight}px)`,
        })}
      />
      <div
        className="absolute top-0 overflow-hidden boot-wireframe"
        data-state={revealed ? "active" : "pending"}
        style={{ left: `${leftSidebarWidth}px`, right: `${rightSidebarWidth}px`, height: `calc(100vh - ${footerHeight}px - ${inputAreaHeight}px)`, opacity: panelVisible.middleChat && !wireframeFaded ? 1 : 0, transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Top-left: New Case header */}
        <div data-inner="chat-header" className="absolute" style={{ left: 0, right: 0, top: 0, height: 48 }}>
          <div className="absolute shimmer-item" style={{ left: 24, top: 20, width: 75, height: 8, border: "1px solid hsl(var(--foreground) / 0.3)", borderRadius: 2 }} />
          <div className="absolute shimmer-item" style={{ right: 24, top: 14, width: 26, height: 26, border: "1px solid hsl(var(--foreground) / 0.32)", borderRadius: 6 }} />
        </div>

        {/* Chat message flow skeleton in centered container (max-w-[720px]) */}
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 40, bottom: 20 }}>
          <div className="relative w-full" style={{ maxWidth: 720, padding: "0 24px" }}>

            {/* 1. Assistant Welcome Message (Unboxed, top-left) */}
            <div data-inner="chat-welcome" className="absolute shimmer-item" style={{ left: 24, width: 340, top: 24, height: 6, borderRadius: 2 }} />

            {/* 2. User Message (Pill bubble, right-aligned) */}
            <div data-inner="chat-user" className="absolute shimmer-item" style={{ right: 24, width: 160, top: 54, height: 32, borderRadius: 16 }}>
              <div className="shimmer-item" style={{ position: "absolute", left: 16, right: 16, top: 13, height: 6, borderRadius: 2 }} />
            </div>

            {/* 3a. Reasoning Card Block */}
            <div data-inner="chat-reasoning" className="absolute shimmer-item" style={{ left: 24, right: 24, top: 104, height: 32, borderRadius: 6 }}>
              <div className="shimmer-item" style={{ position: "absolute", left: 12, top: 13, width: 95, height: 6, borderRadius: 2 }} />
            </div>

            {/* 3b–d. Response body */}
            <div data-inner="chat-response" className="absolute" style={{ left: 24, right: 24, top: 154, height: 160 }}>
              <div className="absolute shimmer-item" style={{ left: 0, width: 230, top: 0, height: 6, borderRadius: 2 }} />
              <div className="absolute" style={{ left: 0, right: 0, top: 18, height: 72 }}>
                <div className="absolute shimmer-item" style={{ left: 0, right: 0, top: 0, height: 6, borderRadius: 2 }} />
                <div className="absolute shimmer-item" style={{ left: 0, right: 50, top: 14, height: 6, borderRadius: 2 }} />
                <div className="absolute shimmer-item" style={{ left: 0, right: 80, top: 28, height: 6, borderRadius: 2 }} />
                <div className="absolute shimmer-item" style={{ left: 0, right: 30, top: 42, height: 6, borderRadius: 2 }} />
                <div className="absolute shimmer-item" style={{ left: 0, right: 110, top: 56, height: 6, borderRadius: 2 }} />
              </div>
              <div className="absolute shimmer-item" style={{ left: 0, right: 60, top: 108, height: 6, borderRadius: 2 }} />
            </div>

            {/* 3e. Copy & Retry actions */}
            <div data-inner="chat-actions" className="absolute flex gap-2" style={{ left: 24, top: 292 }}>
              <div className="shimmer-item" style={{ width: 45, height: 16, borderRadius: 4 }} />
              <div className="shimmer-item" style={{ width: 45, height: 16, borderRadius: 4 }} />
            </div>

          </div>
        </div>
      </div>

      {/* 3. Premium Input — centered (mx-auto max-w-[700px]) */}
      <div
        {...coverProps("snap-up", 500, {
          left: `${leftSidebarWidth}px`,
          right: `${rightSidebarWidth}px`,
          bottom: `${footerHeight}px`,
          height: `${inputAreaHeight}px`,
          borderTop: "1px solid hsl(var(--foreground) / 0.1)",
        })}
      />
      <div
        className="absolute overflow-hidden boot-wireframe"
        data-state={revealed ? "active" : "pending"}
        style={{ left: `${leftSidebarWidth}px`, right: `${rightSidebarWidth}px`, bottom: `${footerHeight}px`, height: `${inputAreaHeight}px`, opacity: panelVisible.premiumInput && !wireframeFaded ? 1 : 0, transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 0, bottom: 0 }}>
          <div className="relative w-full" style={{ maxWidth: 720, padding: "0 10px" }}>
            {/* Input container (rounded-3xl border) */}
            <div data-inner="input-box" className="absolute shimmer-item" style={{ left: 10, right: 10, top: 12, height: 96, borderRadius: 20 }}>
              {/* Textarea row with Plus icon and placeholder text */}
              <div className="absolute flex items-start gap-2.5" style={{ left: 16, right: 16, top: 14, height: 32 }}>
                <div className="shimmer-item" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                <div className="shimmer-item" style={{ width: 85, height: 6, borderRadius: 2, marginTop: 4 }} />
              </div>

              {/* Bottom bar (model selector + actions + mic/send) */}
              <div data-inner="input-bottom" className="absolute flex items-center justify-between px-4" style={{ left: 0, right: 0, bottom: 0, height: 48 }}>
                {/* Left side actions */}
                <div className="flex items-center gap-2">
                  {/* Model selector dropdown */}
                  <div className="shimmer-item" style={{ width: 75, height: 20, borderRadius: 5 }} />
                  {/* Red YOLO Pill */}
                  <div className="shimmer-item" style={{ width: 32, height: 16, borderRadius: 4 }} />
                  {/* Search Button */}
                  <div className="shimmer-item" style={{ width: 55, height: 20, borderRadius: 5 }} />
                  {/* Gen UI Button */}
                  <div className="shimmer-item" style={{ width: 52, height: 20, borderRadius: 5 }} />
                  {/* Research Button */}
                  <div className="shimmer-item" style={{ width: 62, height: 20, borderRadius: 5 }} />
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-2">
                  {/* Microphone icon */}
                  <div className="shimmer-item shimmer-item-circle" style={{ width: 22, height: 22 }} />
                  {/* Send button (up-arrow icon) */}
                  <div className="shimmer-item shimmer-item-circle" style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 6, height: 6, borderLeft: "1px solid hsl(var(--foreground) / 0.35)", borderTop: "1px solid hsl(var(--foreground) / 0.35)", transform: "rotate(45deg)", marginTop: 2 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Right Sidebar — SecondaryActivityBar (48px) + RightPanel (320px default) */}
      <div
        {...coverProps("wipe-right", 750, {
          right: 0,
          top: 0,
          width: `${rightSidebarWidth}px`,
          height: `calc(100vh - ${footerHeight}px)`,
          borderLeft: "1px solid hsl(var(--foreground) / 0.1)",
        })}
      />
      <div
        className="absolute right-0 top-0 overflow-hidden boot-wireframe"
        data-state={revealed ? "active" : "pending"}
        style={{ width: `${rightSidebarWidth}px`, height: `calc(100vh - ${footerHeight}px)`, opacity: panelVisible.rightSidebar && !wireframeFaded ? 1 : 0, transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {rightPanelOpen ? (
          <>
            {/* Activity Bar (48px left strip) */}
            <div className="absolute left-0 top-0 bottom-0" style={{ width: `${secondaryActivityBarWidth}px`, borderRight: "1px solid hsl(var(--foreground) / 0.28)" }}>
              {/* Top group: tab icons */}
              <div data-inner="rs-activity" className="absolute flex flex-col items-center gap-4" style={{ left: 0, right: 0, top: 12 }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={`ab${i}`} className="shimmer-item" style={{ width: 20, height: 20, borderRadius: 4 }} />
                ))}
              </div>
              {/* Bottom group */}
              <div data-inner="rs-activity" className="absolute flex flex-col items-center gap-4" style={{ left: 0, right: 0, bottom: 12 }}>
                <div className="shimmer-item" style={{ width: 20, height: 20, borderRadius: 4 }} />
              </div>
            </div>
            {/* Right Panel Content Area */}
            <div className="absolute top-0 bottom-0 overflow-hidden" style={{ left: `${secondaryActivityBarWidth}px`, right: 0 }}>
              {/* Header (h-14 = 56px) */}
              <div data-inner="rs-header" className="absolute flex items-center justify-between" style={{ left: 0, right: 0, top: 0, height: 56, borderBottom: "1px solid hsl(var(--foreground) / 0.25)", padding: "0 16px" }}>
                <div className="flex items-center gap-2">
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid hsl(var(--foreground) / 0.35)" }} />
                  <div style={{ width: 50, height: 6, border: "1px solid hsl(var(--foreground) / 0.28)", borderRadius: 2 }} />
                </div>
                <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid hsl(var(--foreground) / 0.32)" }} />
              </div>
              {/* Content sections */}
              <div className="absolute overflow-hidden" style={{ left: 0, right: 0, top: 56, bottom: 0, padding: 12 }}>
                <div data-inner="rs-section1" style={{ position: "absolute", left: 12, right: 12, top: 8, height: 24, borderBottom: "1px solid hsl(var(--foreground) / 0.25)" }}>
                  <div style={{ width: "35%", height: 6, border: "1px solid hsl(var(--foreground) / 0.28)", borderRadius: 2 }} />
                </div>
                <div data-inner="rs-section2" style={{ position: "absolute", left: 12, right: 12, top: 44, height: 80, border: "1px solid hsl(var(--foreground) / 0.25)", borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: 8, top: 8, width: "60%", height: 5, border: "1px solid hsl(var(--foreground) / 0.25)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: 8, top: 22, width: "80%", height: 5, border: "1px solid hsl(var(--foreground) / 0.22)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: 8, top: 36, width: "50%", height: 5, border: "1px solid hsl(var(--foreground) / 0.22)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: 8, bottom: 8, width: 90, height: 18, border: "1px solid hsl(var(--foreground) / 0.25)", borderRadius: 4 }} />
                </div>
                <div data-inner="rs-section3" style={{ position: "absolute", left: 12, right: 12, top: 136, height: 60, border: "1px solid hsl(var(--foreground) / 0.25)", borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: 8, top: 8, width: "40%", height: 5, border: "1px solid hsl(var(--foreground) / 0.25)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: 8, top: 22, width: "70%", height: 5, border: "1px solid hsl(var(--foreground) / 0.22)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: 8, top: 36, width: "30%", height: 5, border: "1px solid hsl(var(--foreground) / 0.22)", borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Activity bar only (48px) */
          <div className="absolute left-0 top-0 bottom-0" style={{ width: `${secondaryActivityBarWidth}px` }}>
            <div data-inner="rs-activity" className="absolute flex flex-col items-center gap-4" style={{ left: 0, right: 0, top: 12 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={`ab${i}`} className="shimmer-item" style={{ width: 20, height: 20, borderRadius: 4 }} />
              ))}
            </div>
            <div data-inner="rs-activity" className="absolute flex flex-col items-center gap-4" style={{ left: 0, right: 0, bottom: 12 }}>
              <div className="shimmer-item" style={{ width: 20, height: 20, borderRadius: 4 }} />
            </div>
          </div>
        )}
      </div>

      {/* 5. Status Bar (h-7 = 28px) — status text left, date/time right */}
      <div
        {...coverProps("scale-x", 1000, {
          bottom: 0,
          left: 0,
          right: 0,
          height: `${footerHeight}px`,
          borderTop: "1px solid hsl(var(--foreground) / 0.1)",
        })}
      />
      <div
        className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-center px-3 boot-wireframe"
        data-state={revealed ? "active" : "pending"}
        style={{ height: `${footerHeight}px`, opacity: panelVisible.bottomFooter && !wireframeFaded ? 1 : 0, transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Left: warning badge, development text, and version */}
        <div data-inner="ft-left" className="flex items-center gap-2.5">
          {/* Warning triangle */}
          <div className="shimmer-item" style={{ width: 10, height: 10, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }} />
          {/* UNDER ACTIVE DEVELOPMENT — DEV BUILD */}
          <div className="shimmer-item" style={{ width: 175, height: 5, borderRadius: 2 }} />
          {/* Separator */}
          <div style={{ width: 1, height: 8, borderLeft: "1px solid hsl(var(--foreground) / 0.22)" }} />
          {/* ZEN v0.1.0 */}
          <div className="shimmer-item" style={{ width: 45, height: 5, borderRadius: 2 }} />
        </div>
        <div className="flex-1" />
        {/* Right: date + time */}
        <div data-inner="ft-right" className="flex items-center gap-2">
          {/* Calendar icon */}
          <div className="shimmer-item" style={{ width: 14, height: 14, borderRadius: 3 }} />
          {/* Monday, June 29, 2026 */}
          <div className="shimmer-item" style={{ width: 85, height: 5, borderRadius: 2 }} />
          {/* Separator */}
          <div style={{ width: 1, height: 8, borderLeft: "1px solid hsl(var(--foreground) / 0.22)" }} />
          {/* Clock icon */}
          <div className="shimmer-item shimmer-item-circle" style={{ width: 14, height: 14 }} />
          {/* 09:11 PM */}
          <div className="shimmer-item" style={{ width: 40, height: 5, borderRadius: 2 }} />
        </div>
      </div>

    </div>
  );
}

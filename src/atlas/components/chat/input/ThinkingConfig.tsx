import { useCallback, useEffect, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import type { ReasoningCapability } from '@/lib/types/provider';

interface ThinkingConfigProps {
  capability: ReasoningCapability;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  thinkingEffort: string;
  setThinkingEffort: (val: string) => void;
  thinkingBudget: number;
  setThinkingBudget: (val: number) => void;
  provider?: string;
}

const LEVEL_LABEL: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max',
};

const titleCase = (v: string) => LEVEL_LABEL[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const REASONING_HELP =
  'Controls how much the model thinks before answering. Drag from Off up to spend ' +
  'more reasoning — deeper answers, but slower and more tokens.';

// The header label doubles as the feature explainer, so the info affordance is
// a real button (title tooltip + accessible label), not decorative text.
const ReasoningHelp = () => (
  <button
    type="button"
    title={REASONING_HELP}
    aria-label={REASONING_HELP}
    className="composer-control -m-1 grid h-5 w-5 min-h-0 min-w-0 place-items-center rounded-full p-0 opacity-60 hover:opacity-100"
  >
    <HelpCircle aria-hidden="true" className="w-3 h-3" />
  </button>
);

// Slider geometry (mirrors the .effort-track skin in index.css): a 32px thumb
// inside a rail with 5px end padding rests 21px in and travels `width - 42`.
const THUMB_SIZE = 32;
const RAIL_PAD = 5;
const THUMB_OFFSET = RAIL_PAD + THUMB_SIZE / 2;
const travelOf = (w: number) => Math.max(0, w - THUMB_SIZE - RAIL_PAD * 2);
const ratioAt = (clientX: number, left: number, width: number) => {
  const t = travelOf(width);
  if (t === 0) return 0;
  return Math.min(1, Math.max(0, (clientX - left - THUMB_OFFSET) / t));
};

interface RailPaint {
  /** aria-valuenow for the current position (stop index). */
  valueNow: number;
  /** Human label shown live in the header and as aria-valuetext. */
  valueText: string;
  /** Highest lit stop index (inclusive); -1 for the Off stop / stop-less rail. */
  litUpTo: number;
  /** True at the Off stop, so the header value reads as inactive. */
  dimmed: boolean;
}

/**
 * One recessed pill rail with a grooved thumb, hand-rolled rather than a Radix
 * slider so a drag writes one CSS variable (`--effort-ratio`) straight to the
 * DOM per pointer move — no React render — and commits to state only on release.
 * Drives every reasoning shape from a single discrete stop space owned by the
 * caller: the leftmost stop is Off (when the model can be disabled), then the
 * effort ladder or token-budget steps. The caller's `describe`/`commit`/`snap`/
 * `keyStep` translate a 0…1 ratio to that stop space.
 */
function RailSlider({
  ratio, stopCount, ariaMin, ariaMax, labelRef,
  describe, commit, snap, keyStep,
}: {
  ratio: number;
  stopCount: number;
  ariaMin: number;
  ariaMax: number;
  labelRef: React.RefObject<HTMLElement | null>;
  describe: (ratio: number) => RailPaint;
  commit: (ratio: number) => void;
  snap: (ratio: number) => number;
  keyStep: (key: string, ratio: number) => number | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(ratio);

  const paint = useCallback((r: number) => {
    const track = trackRef.current;
    if (!track) return;
    ratioRef.current = r;
    track.style.setProperty('--effort-ratio', String(r));
    const d = describe(r);
    track.setAttribute('aria-valuenow', String(d.valueNow));
    track.setAttribute('aria-valuetext', d.valueText);
    track.querySelectorAll<HTMLElement>('.effort-stops span').forEach((s, i) => {
      s.dataset.lit = i <= d.litUpTo ? 'true' : '';
    });
    if (labelRef.current) {
      labelRef.current.textContent = d.valueText;
      labelRef.current.dataset.dim = d.dimmed ? 'true' : '';
    }
  }, [describe, labelRef]);

  // Keep the DOM in step when the value changes from outside a drag.
  useEffect(() => { paint(ratio); }, [ratio, paint]);

  // Travel must be a px length for `translateX`, so measure the rail (and
  // remeasure on resize — the popover can be narrower on a small viewport).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      track.style.setProperty('--effort-travel', `${travelOf(track.getBoundingClientRect().width)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const ratioFromEvent = (clientX: number) => {
    const { left, width } = trackRef.current!.getBoundingClientRect();
    return ratioAt(clientX, left, width);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const track = trackRef.current!;
    track.setPointerCapture(e.pointerId);
    track.dataset.dragging = 'true';
    track.focus();
    paint(ratioFromEvent(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!trackRef.current?.dataset.dragging) return;
    paint(ratioFromEvent(e.clientX));
  };
  const endDrag = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track?.dataset.dragging) return;
    delete track.dataset.dragging;
    track.releasePointerCapture(e.pointerId);
    paint(snap(ratioRef.current));
    commit(ratioRef.current);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = keyStep(e.key, ratioRef.current);
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  return (
    <div
      ref={trackRef}
      className="effort-track"
      role="slider"
      tabIndex={0}
      aria-label="Reasoning effort"
      aria-valuemin={ariaMin}
      aria-valuemax={ariaMax}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div className="effort-fill" aria-hidden="true" />
      <div className="effort-stops" aria-hidden="true">
        {Array.from({ length: stopCount }, (_, i) => <span key={i} data-step={i} />)}
      </div>
      <div className="effort-thumb" aria-hidden="true" />
    </div>
  );
}

const OFF = '__off__';
const ON = '__on__';
const stopLabel = (s: string) => (s === OFF ? 'Off' : s === ON ? 'On' : titleCase(s));

// Budget rail folds Off into a small dead-zone at the far left so a single
// drag covers Off → min … max without a separate switch.
const OFF_ZONE = 0.06;

/**
 * Reasoning config popover. The whole control is one slider generated from the
 * backend-resolved `ReasoningCapability`: the leftmost stop is Off (when the
 * model can be disabled), then the effort ladder (Minimal…Max) or the token
 * budget. `toggleable` collapses to Off↔On, `always_on` / `provider_managed`
 * show a note. `unknown` / `unsupported` never reach here — the chip is hidden
 * upstream.
 */
export const ThinkingConfig = ({
  capability,
  isThinking, setIsThinking,
  thinkingEffort, setThinkingEffort,
  thinkingBudget, setThinkingBudget,
  provider,
}: ThinkingConfigProps) => {
  const isGoogle = provider?.toLowerCase() === 'google' || provider?.toLowerCase() === 'gemini';
  const effortLabel = isGoogle ? 'Thinking Level' : 'Reasoning Effort';
  const labelRef = useRef<HTMLElement>(null);

  const zenControllable = capability.controlAvailability === 'zen';
  const isTunable = capability.support === 'tunable' && zenControllable;
  const isToggleable = capability.support === 'toggleable' && zenControllable;
  const usesBudget = capability.minBudget != null || capability.maxBudget != null;
  const levels = capability.levels ?? [];
  const minBudget = capability.minBudget ?? 1024;
  const maxBudget = capability.maxBudget ?? 32768;
  const stepBudget = capability.stepBudget ?? 1024;
  const canDisable = capability.canDisable;

  // Discrete rail: Off (optional) + effort levels, or Off + On for toggleable.
  const useDiscrete = (isTunable && !usesBudget && levels.length > 0) || isToggleable;
  const valueStops = isToggleable ? [ON] : levels;
  const stops = canDisable ? [OFF, ...valueStops] : valueStops;
  const lastStop = stops.length - 1;
  const currentStop = (() => {
    if (canDisable && !isThinking) return 0;
    if (isToggleable) return stops.indexOf(ON);
    const i = stops.indexOf(thinkingEffort);
    return i >= 0 ? i : Math.min(lastStop, canDisable ? 1 : 0);
  })();
  const discreteRatio = lastStop > 0 ? currentStop / lastStop : 0;
  const stopAt = (r: number) => (lastStop > 0 ? Math.round(r * lastStop) : 0);
  const discreteDescribe = (r: number): RailPaint => {
    const s = stopAt(r);
    return { valueNow: s, valueText: stopLabel(stops[s]), litUpTo: s, dimmed: stops[s] === OFF };
  };
  const discreteCommit = (r: number) => {
    const s = stops[stopAt(r)];
    if (s === OFF) { setIsThinking(false); return; }
    if (s !== ON) setThinkingEffort(s);
    setIsThinking(true);
  };
  const discreteKeyStep = (key: string, r: number): number | null => {
    const cur = stopAt(r);
    const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[key];
    const jump = { Home: 0, End: lastStop }[key];
    if (delta === undefined && jump === undefined) return null;
    const next = jump ?? clamp(cur + delta!, 0, lastStop);
    return lastStop > 0 ? next / lastStop : 0;
  };

  // Budget rail: Off dead-zone (when disableable) then min…max, step-rounded.
  const span = maxBudget - minBudget;
  const offZone = canDisable ? OFF_ZONE : 0;
  const usableOf = (r: number) => (offZone > 0 ? clamp((r - offZone) / (1 - offZone), 0, 1) : r);
  const railOf = (usable: number) => offZone + usable * (1 - offZone);
  const budgetAt = (r: number) => clamp(Math.round((minBudget + usableOf(r) * span) / stepBudget) * stepBudget, minBudget, maxBudget);
  const budgetRatio = canDisable && !isThinking ? 0 : railOf(span > 0 ? clamp((thinkingBudget - minBudget) / span, 0, 1) : 0);
  const budgetIsOff = (r: number) => canDisable && r < offZone;
  const budgetDescribe = (r: number): RailPaint =>
    budgetIsOff(r)
      ? { valueNow: 0, valueText: 'Off', litUpTo: -1, dimmed: true }
      : { valueNow: budgetAt(r), valueText: `${budgetAt(r).toLocaleString()} tokens`, litUpTo: -1, dimmed: false };
  const budgetCommit = (r: number) => {
    if (budgetIsOff(r)) { setIsThinking(false); return; }
    setThinkingBudget(budgetAt(r));
    setIsThinking(true);
  };
  const budgetSnap = (r: number) => (budgetIsOff(r) ? 0 : railOf(span > 0 ? (budgetAt(r) - minBudget) / span : 0));
  const budgetKeyStep = (key: string, r: number): number | null => {
    if (key === 'Home') return 0;
    if (key === 'End') return 1;
    const dir = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[key];
    if (dir === undefined) return null;
    if (budgetIsOff(r)) return dir > 0 ? railOf(0) : 0;
    const next = clamp(budgetAt(r) + dir * stepBudget, minBudget, maxBudget);
    return railOf(span > 0 ? (next - minBudget) / span : 0);
  };

  return (
    <div className="space-y-3">
      {/* Tunable · effort ladder OR toggleable on/off — one slider, Off is its
          left stop, so there's no separate switch. */}
      {useDiscrete && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {isToggleable ? 'Reasoning' : effortLabel}
              <ReasoningHelp />
            </span>
            <span ref={labelRef} className="text-warning data-[dim=true]:text-muted-foreground">
              {stopLabel(stops[currentStop])}
            </span>
          </div>
          {!isToggleable && (
            <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground" aria-hidden="true">
              <span>{canDisable ? 'Off' : 'Faster'}</span>
              <span>Smarter</span>
            </div>
          )}
          <RailSlider
            ratio={discreteRatio}
            stopCount={stops.length}
            ariaMin={0}
            ariaMax={lastStop}
            labelRef={labelRef}
            describe={discreteDescribe}
            commit={discreteCommit}
            snap={(r) => (lastStop > 0 ? stopAt(r) / lastStop : 0)}
            keyStep={discreteKeyStep}
          />
        </div>
      )}

      {/* Tunable · token budget on the same rail skin; Off is its left dead-zone. */}
      {isTunable && usesBudget && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              Thinking Budget
              <ReasoningHelp />
            </span>
            <span ref={labelRef} className="text-warning data-[dim=true]:text-muted-foreground">
              {thinkingBudget.toLocaleString()} tokens
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground" aria-hidden="true">
            <span>{canDisable ? 'Off' : `${Math.round(minBudget / 1024)}K`}</span>
            <span>{Math.round(maxBudget / 1024)}K</span>
          </div>
          <RailSlider
            ratio={budgetRatio}
            stopCount={0}
            ariaMin={minBudget}
            ariaMax={maxBudget}
            labelRef={labelRef}
            describe={budgetDescribe}
            commit={budgetCommit}
            snap={budgetSnap}
            keyStep={budgetKeyStep}
          />
        </div>
      )}

      {/* Always-on: native reasoning, nothing to configure. */}
      {capability.support === 'always_on' && (
        <div className="composer-meta rounded bg-muted px-2.5 py-1.5 text-center text-[10px] italic">
          This model always reasons; reasoning depth isn't configurable from Zen.
        </div>
      )}

      {/* Provider-managed: reasoning exists but Zen's endpoint can't drive it. */}
      {capability.controlAvailability === 'provider_managed' && (
        <div className="composer-meta rounded bg-muted px-2.5 py-1.5 text-center text-[10px] italic">
          Reasoning is controlled by the provider, not from Zen.
        </div>
      )}
    </div>
  );
};

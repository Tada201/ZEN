import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { GraphSessionState, SessionAction, SessionFeedback, VisionCapture, ExprPlotResult } from '../../types/session';

interface SessionStore {
  activeSessionId: string | null;
  state: GraphSessionState | null;
  plotData: Record<string, ExprPlotResult>;
  isLoading: boolean;
  error: string | null;
  lastVisionCapture: VisionCapture | null;

  // Actions
  createSession: (name: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  applyAction: (action: SessionAction) => Promise<void>;
  captureVision: () => Promise<VisionCapture | null>;
  rollback: (version: number) => Promise<void>;
  clearSession: () => void;
  applyFeedback: (feedback: SessionFeedback) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  activeSessionId: null,
  state: null,
  plotData: {},
  isLoading: false,
  error: null,
  lastVisionCapture: null,

  createSession: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const sessionId: string = await invoke('create_graph_session', { name });
      set({ activeSessionId: sessionId });
      await get().loadSession(sessionId);
    } catch (e: any) {
      set({ error: e.toString() });
    } finally {
      set({ isLoading: false });
    }
  },

  loadSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const state: GraphSessionState = await invoke('get_session_state', { sessionId });
      set({ state, activeSessionId: sessionId });
    } catch (e: any) {
      set({ error: e.toString() });
    } finally {
      set({ isLoading: false });
    }
  },

  applyAction: async (action: SessionAction) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    set({ isLoading: true, error: null });
    try {
      const feedback: SessionFeedback = await invoke('apply_session_action', {
        sessionId: activeSessionId,
        action,
      });
      console.log('[SessionStore] Feedback received:', feedback);
      
      const plotData = (feedback.plots || []).reduce((acc: Record<string, ExprPlotResult>, plot) => {
        acc[plot.id] = plot;
        return acc;
      }, {});
      
      set({
        state: feedback.state_snapshot,
        plotData,
      });
    } catch (e: any) {
      console.error('[SessionStore] Error:', e);
      set({ error: e.toString() });
    } finally {
      set({ isLoading: false });
    }
  },

  captureVision: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return null;

    set({ isLoading: true, error: null });
    try {
      const visionCapture: VisionCapture = await invoke('apply_session_action', {
        sessionId: activeSessionId,
        action: { action: 'capture_vision' },
      });
      
      set({ lastVisionCapture: visionCapture });
      return visionCapture;
    } catch (e: any) {
      console.error('[SessionStore] Vision capture error:', e);
      set({ error: e.toString() });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  rollback: async (version: number) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    set({ isLoading: true, error: null });
    try {
      const feedback: SessionFeedback = await invoke('rollback_session', {
        sessionId: activeSessionId,
        version,
      });
      const plotData = (feedback.plots || []).reduce((acc: Record<string, ExprPlotResult>, plot) => {
        acc[plot.id] = plot;
        return acc;
      }, {});
      
      set({
        state: feedback.state_snapshot,
        plotData,
      });
    } catch (e: any) {
      set({ error: e.toString() });
    } finally {
      set({ isLoading: false });
    }
  },

  clearSession: () => {
    set({ activeSessionId: null, state: null, plotData: {}, error: null, lastVisionCapture: null });
  },

  applyFeedback: (feedback: SessionFeedback) => {
    const plotData = (feedback.plots || []).reduce((acc: Record<string, ExprPlotResult>, plot) => {
      acc[plot.id] = plot;
      return acc;
    }, {});
    
    set({
      activeSessionId: feedback.session_id,
      state: feedback.state_snapshot,
      plotData,
      error: feedback.status === 'error' ? 'Session error' : null,
    });
  },
}));

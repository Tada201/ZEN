import { create } from 'zustand'

interface TelemetryState {
  metrics: {
    cpu: number
    memory: number
    gpu: number
    fps: number
    latency: number
    throughput: number
  }
  status: 'idle' | 'busy' | 'error'
  updateMetrics: (newMetrics: Partial<TelemetryState['metrics']>) => void
  setStatus: (status: TelemetryState['status']) => void
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  metrics: {
    cpu: 0,
    memory: 0,
    gpu: 0,
    fps: 60,
    latency: 0,
    throughput: 0,
  },
  status: 'idle',
  updateMetrics: (newMetrics) =>
    set((state) => ({
      metrics: { ...state.metrics, ...newMetrics },
    })),
  setStatus: (status) => set({ status }),
}))
import { create } from 'zustand';
import type { SolverProgressEvent, SolverResult } from '../types';

interface SolverState {
  status: 'idle' | 'running' | 'complete' | 'error';
  progress: SolverProgressEvent[];
  result: SolverResult | null;
  error: string | null;
  setRunning: () => void;
  addProgress: (evt: SolverProgressEvent) => void;
  setComplete: (result: SolverResult) => void;
  setError: (msg: string) => void;
  reset: () => void;
}

export const useSolverStore = create<SolverState>((set) => ({
  status: 'idle',
  progress: [],
  result: null,
  error: null,
  setRunning: () => set({ status: 'running', progress: [], result: null, error: null }),
  addProgress: (evt) => set((s) => ({ progress: [...s.progress, evt] })),
  setComplete: (result) => set({ status: 'complete', result }),
  setError: (msg) => set({ status: 'error', error: msg }),
  reset: () => set({ status: 'idle', progress: [], result: null, error: null }),
}));

import { create } from 'zustand';

interface ScenarioState {
  selectedScenarioId: string | null;
  plantFilter: string[];
  lineFilter: string[];
  allPlants: string[];
  allLines: string[];
  setScenario: (id: string) => void;
  setPlantFilter: (plants: string[]) => void;
  setLineFilter: (lines: string[]) => void;
  setAllPlants: (plants: string[]) => void;
  setAllLines: (lines: string[]) => void;
}

export const useScenarioStore = create<ScenarioState>((set) => ({
  selectedScenarioId: null,
  plantFilter: [],
  lineFilter: [],
  allPlants: [],
  allLines: [],
  setScenario: (id) => set({ selectedScenarioId: id }),
  setPlantFilter: (plants) => set({ plantFilter: plants }),
  setLineFilter: (lines) => set({ lineFilter: lines }),
  setAllPlants: (plants) => set({ allPlants: plants, plantFilter: plants }),
  setAllLines: (lines) => set({ allLines: lines }),
}));

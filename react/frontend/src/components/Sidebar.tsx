import { NavLink, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  BarChart3,
  FlaskConical,
  FileCheck,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import { useScenarioStore } from '../stores/scenarioStore';
import type { Scenario, Plant, Line } from '../types';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { to: '/overview', label: 'Executive Overview', icon: LayoutDashboard },
  { to: '/explorer', label: 'Data Explorer', icon: Database },
  { to: '/results', label: 'Optimization Results', icon: BarChart3 },
  { to: '/studio', label: 'Scenario Studio', icon: FlaskConical },
  { to: '/contracts', label: 'Contract Monitor', icon: FileCheck },
];

export default function Sidebar() {
  const {
    selectedScenarioId, setScenario, plantFilter, setPlantFilter, setAllPlants, allPlants,
  } = useScenarioStore();

  const { data: scenarios } = useSnowflakeQuery<Scenario[]>(['scenarios'], '/api/scenarios');
  const { data: plants } = useSnowflakeQuery<Plant[]>(['plants'], '/api/common/plants');

  useEffect(() => {
    if (scenarios?.length && !selectedScenarioId) {
      setScenario(scenarios[0].scenario_id);
    }
  }, [scenarios, selectedScenarioId, setScenario]);

  useEffect(() => {
    if (plants?.length && allPlants.length === 0) {
      setAllPlants(plants.map((p) => p.plant_name));
    }
  }, [plants, allPlants.length, setAllPlants]);

  return (
    <aside className="w-64 flex-shrink-0 h-screen sticky top-0 overflow-y-auto bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <h2 className="text-lg font-bold text-sf-blue">Product Wheel</h2>
        <p className="text-xs text-gray-500 dark:text-dark-muted">Schedule Optimization</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sf-blue/10 text-sf-blue'
                  : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-border/50',
              )
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-dark-border space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-dark-muted">Scenario</label>
          <select
            value={selectedScenarioId ?? ''}
            onChange={(e) => setScenario(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text"
          >
            {scenarios?.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.scenario_id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-dark-muted">Plants</label>
          <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
            {allPlants.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={plantFilter.includes(p)}
                  onChange={(e) => {
                    setPlantFilter(
                      e.target.checked
                        ? [...plantFilter, p]
                        : plantFilter.filter((x) => x !== p),
                    );
                  }}
                  className="rounded text-sf-blue"
                />
                {p}
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

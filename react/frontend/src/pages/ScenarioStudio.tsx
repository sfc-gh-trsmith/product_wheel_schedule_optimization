import { useState, useMemo, useEffect } from 'react';
import { useScenarioStore } from '../stores/scenarioStore';
import { useSolverStore } from '../stores/solverStore';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import { useSolverSSE } from '../hooks/useSolverSSE';
import ChartContainer from '../components/ChartContainer';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import { FAMILY_COLORS, useChartLayout } from '../types/charts';
import type { Plant, Line, DemandAgg, KPI, ScheduleRow, SolverParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

export default function ScenarioStudio() {
  const { selectedScenarioId: baseline } = useScenarioStore();
  const solver = useSolverStore();
  const { run } = useSolverSSE();

  const { data: plants } = useSnowflakeQuery<Plant[]>(['plants'], '/api/common/plants');
  const { data: lines } = useSnowflakeQuery<any[]>(['lines-all'], '/api/common/lines');
  const { data: families } = useSnowflakeQuery<{ product_family: string }[]>(['families'], '/api/common/families');
  const { data: demandAgg } = useSnowflakeQuery<DemandAgg[]>(['demand-agg'], '/api/scenarios/demand-agg');

  const allPlants = useMemo(() => plants?.map((p) => p.plant_name) ?? [], [plants]);
  const allFamilies = useMemo(() => families?.map((f) => f.product_family) ?? [], [families]);

  const [horizonDays, setHorizonDays] = useState(14);
  const [shiftsPerDay, setShiftsPerDay] = useState(3);
  const [invCostMult, setInvCostMult] = useState(1.0);
  const [boCostMult, setBoCostMult] = useState(1.0);
  const [coCostMult, setCoCostMult] = useState(1.0);
  const [plantSel, setPlantSel] = useState<string[]>([]);
  const [lineSel, setLineSel] = useState<string[]>([]);
  const [maxProducts, setMaxProducts] = useState(15);
  const [timeLimit, setTimeLimit] = useState(120);
  const [mipGap, setMipGap] = useState(1.0);
  const [demandMult, setDemandMult] = useState(1.0);
  const [shockFamily, setShockFamily] = useState('None');
  const [shockPct, setShockPct] = useState(0);
  const [invMult, setInvMult] = useState(1.0);

  useEffect(() => {
    if (allPlants.length && plantSel.length === 0) setPlantSel(allPlants);
  }, [allPlants]);

  const filteredLines = useMemo(() => {
    if (!lines?.length) return [];
    return lines.filter((l: any) => plantSel.includes(l.plant_name)).map((l: any) => l.line_code);
  }, [lines, plantSel]);

  useEffect(() => {
    if (filteredLines.length && lineSel.length === 0) setLineSel(filteredLines);
  }, [filteredLines]);

  const previewData = useMemo(() => {
    if (!demandAgg?.length) return [];
    const grouped: Record<string, { base: number; adj: number }> = {};
    for (const r of demandAgg) {
      if (!grouped[r.product_family]) grouped[r.product_family] = { base: 0, adj: 0 };
      grouped[r.product_family].base += r.forecast_qty;
      let adj = r.forecast_qty * demandMult;
      if (shockFamily !== 'None' && r.product_family === shockFamily && shockPct !== 0) {
        adj *= 1 + shockPct / 100;
      }
      grouped[r.product_family].adj += adj;
    }
    return Object.entries(grouped).map(([fam, { base, adj }]) => ({ family: fam, base, adj }));
  }, [demandAgg, demandMult, shockFamily, shockPct]);

  const nLinesSel = lineSel.length || filteredLines.length;
  const nSlots = horizonDays * shiftsPerDay;
  const estTime = Math.max(1, Math.round(nLinesSel * nSlots * maxProducts / 5000));

  const handleRun = () => {
    const params: SolverParams = {
      horizon_days: horizonDays,
      shifts_per_day: shiftsPerDay,
      time_limit: timeLimit,
      mip_gap: mipGap,
      inv_cost_mult: invCostMult,
      bo_cost_mult: boCostMult,
      co_cost_mult: coCostMult,
      demand_mult: demandMult,
      shock_family: shockFamily !== 'None' ? shockFamily : null,
      shock_pct: shockPct,
      inv_mult: invMult,
      plant_filter: plantSel,
      line_filter: lineSel,
      max_products_per_line: maxProducts,
    };
    run(params);
  };

  const newScenarioId = solver.result?.scenario_id;
  const { data: baseKpi } = useSnowflakeQuery<KPI[]>(['base-kpi-comp', baseline!], `/api/results/kpis?scenario=${baseline}`, !!baseline && !!newScenarioId);
  const { data: newKpi } = useSnowflakeQuery<KPI[]>(['new-kpi-comp', newScenarioId!], `/api/results/kpis?scenario=${newScenarioId}`, !!newScenarioId);
  const { data: baseSched } = useSnowflakeQuery<ScheduleRow[]>(['base-sched-comp', baseline!], `/api/results/schedule?scenario=${baseline}`, !!baseline && !!newScenarioId);
  const { data: newSched } = useSnowflakeQuery<ScheduleRow[]>(['new-sched-comp', newScenarioId!], `/api/results/schedule?scenario=${newScenarioId}`, !!newScenarioId);

  const calcMetrics = (kpi: KPI[] | undefined) => {
    if (!kpi?.length) return null;
    const tp = kpi.reduce((s, r) => s + (r.total_planned_qty || 0), 0);
    const td = kpi.reduce((s, r) => s + (r.total_demand_qty || 0), 0);
    const seen = new Set<string>();
    let co = 0;
    for (const r of kpi) {
      const k = `${r.plant_name}|${r.line_code}`;
      if (!seen.has(k)) { seen.add(k); co += r.changeover_hours || 0; }
    }
    return { fill_rate: tp / Math.max(td, 1), changeover_hrs: co, total_planned: tp, objective_cost: kpi.reduce((s, r) => s + (r.objective_cost || 0), 0) };
  };
  const bm = calcMetrics(baseKpi);
  const nm = calcMetrics(newKpi);

  const makeGantt = (sched: ScheduleRow[] | undefined) => {
    if (!sched?.length) return [];
    const grouped: Record<string, ScheduleRow[]> = {};
    for (const r of sched) { const f = r.product_family; if (!grouped[f]) grouped[f] = []; grouped[f].push(r); }
    return Object.entries(grouped).map(([fam, rows]) => ({
      type: 'bar' as const, y: rows.map((r) => r.line_code), base: rows.map((r) => r.time_slot_start),
      x: rows.map((r) => new Date(r.time_slot_end).getTime() - new Date(r.time_slot_start).getTime()),
      orientation: 'h' as const, name: fam, marker: { color: FAMILY_COLORS[fam] || '#29B5E8' },
    }));
  };

  const handleSave = async () => {
    if (!newScenarioId) return;
    await fetch('/api/scenarios/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_id: newScenarioId, horizon_days: horizonDays, shifts_per_day: shiftsPerDay,
        time_limit: timeLimit, mip_gap: mipGap, inv_cost_mult: invCostMult, bo_cost_mult: boCostMult,
        co_cost_mult: coCostMult, demand_mult: demandMult, shock_family: shockFamily !== 'None' ? shockFamily : null,
        shock_pct: shockPct, inv_mult: invMult,
        plant_filter: plantSel.join(',') || 'All', line_filter: lineSel.join(',') || 'All',
        max_products_per_line: maxProducts, solve_time_sec: solver.result?.solve_time_sec || 0,
        total_objective_cost: solver.result?.total_objective_cost || 0,
      }),
    });
    solver.reset();
  };

  const handleDiscard = async () => {
    if (!newScenarioId) return;
    await fetch(`/api/scenarios/discard?scenario_id=${newScenarioId}`, { method: 'DELETE' });
    solver.reset();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scenario Studio</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Configure parameters, run what-if optimizations, and compare results</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 space-y-3">
          <h2 className="text-lg font-semibold">Parameter Configuration</h2>

          <Section title="Planning Horizon">
            <RangeInput label="Horizon Days" value={horizonDays} min={7} max={28} onChange={setHorizonDays} />
            <SelectInput label="Shifts per Day" value={String(shiftsPerDay)} options={['1', '2', '3']} onChange={(v) => setShiftsPerDay(Number(v))} />
          </Section>

          <Section title="Cost Weights">
            <RangeInput label="Inventory Holding Cost Mult" value={invCostMult} min={0.1} max={5} step={0.1} onChange={setInvCostMult} />
            <RangeInput label="Backorder Penalty Mult" value={boCostMult} min={0.5} max={10} step={0.5} onChange={setBoCostMult} />
            <RangeInput label="Changeover Cost Mult" value={coCostMult} min={0.1} max={5} step={0.1} onChange={setCoCostMult} />
          </Section>

          <Section title="Line Scope">
            <MultiSelect label="Plants" options={allPlants} value={plantSel} onChange={setPlantSel} />
            <MultiSelect label="Lines" options={filteredLines} value={lineSel} onChange={setLineSel} />
            <RangeInput label="Max Products per Line" value={maxProducts} min={5} max={25} onChange={setMaxProducts} />
          </Section>

          <Section title="Solver Settings">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-dark-muted">Time Limit (sec)</label>
              <input type="number" value={timeLimit} min={10} max={600} step={10} onChange={(e) => setTimeLimit(Number(e.target.value))} className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg" />
            </div>
            <RangeInput label="MIP Gap (%)" value={mipGap} min={0.1} max={10} step={0.1} onChange={setMipGap} />
          </Section>

          <Section title="Demand Scenarios">
            <RangeInput label="Demand Multiplier" value={demandMult} min={0.5} max={2} step={0.1} onChange={setDemandMult} />
            <SelectInput label="Shock Family" value={shockFamily} options={['None', ...allFamilies]} onChange={setShockFamily} />
            <RangeInput label="Shock Magnitude (%)" value={shockPct} min={-50} max={100} step={5} onChange={setShockPct} />
          </Section>

          <Section title="Inventory Override">
            <RangeInput label="Starting Inventory Mult" value={invMult} min={0} max={3} step={0.1} onChange={setInvMult} />
          </Section>
        </div>

        <div className="col-span-3 space-y-4">
          <h2 className="text-lg font-semibold">Parameter Impact Preview</h2>
          <ChartContainer
            title="Demand Profile: Baseline vs. Adjusted"
            height={300}
            data={previewData.length ? [
              { type: 'bar' as const, x: previewData.map((r) => r.family), y: previewData.map((r) => r.base), name: 'Baseline', marker: { color: '#475569' } },
              { type: 'bar' as const, x: previewData.map((r) => r.family), y: previewData.map((r) => r.adj), name: 'Adjusted', marker: { color: '#29B5E8' } },
            ] : []}
            layout={{ barmode: 'group', yaxis: { title: 'Demand Qty' } }}
          />
          <div className="grid grid-cols-2 gap-4">
            <KPICard label="Estimated Solve Time" value={`~${estTime} sec`} />
            <KPICard label="Problem Size" value={`${nLinesSel} lines x ${nSlots} slots x ${maxProducts} products`} />
          </div>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-dark-border" />

      <button
        onClick={handleRun}
        disabled={solver.status === 'running'}
        className="w-full py-3 rounded-lg bg-sf-blue text-white font-semibold hover:bg-sf-navy transition-colors disabled:opacity-50"
      >
        {solver.status === 'running' ? 'Solving...' : 'Run Optimization'}
      </button>

      {solver.status === 'running' && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 dark:bg-dark-border rounded-full h-3">
            <div className="bg-sf-blue h-3 rounded-full transition-all" style={{ width: `${solver.progress[solver.progress.length - 1]?.pct ?? 0}%` }} />
          </div>
          <div className="space-y-1">
            {solver.progress.map((p, i) => (
              <div key={i} className="text-sm text-gray-600 dark:text-dark-muted">
                Line {p.line}: {p.status}
              </div>
            ))}
          </div>
        </div>
      )}

      {solver.status === 'error' && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg">{solver.error}</div>}

      {solver.status === 'complete' && bm && nm && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Scenario Comparison</h2>
          <div className="grid grid-cols-4 gap-4">
            <KPICard label="Fill Rate" value={`${(nm.fill_rate * 100).toFixed(1)}%`} delta={`${((nm.fill_rate - bm.fill_rate) * 100).toFixed(1)} pp`} deltaColor={nm.fill_rate >= bm.fill_rate ? 'green' : 'red'} />
            <KPICard label="Changeover Hrs" value={nm.changeover_hrs.toFixed(1)} delta={`${(nm.changeover_hrs - bm.changeover_hrs).toFixed(1)}`} deltaColor={nm.changeover_hrs <= bm.changeover_hrs ? 'green' : 'red'} />
            <KPICard label="Total Planned" value={nm.total_planned.toLocaleString()} delta={`${(nm.total_planned - bm.total_planned).toLocaleString()}`} deltaColor={nm.total_planned >= bm.total_planned ? 'green' : 'red'} />
            <KPICard label="Objective Cost" value={`$${nm.objective_cost.toLocaleString()}`} delta={`$${(nm.objective_cost - bm.objective_cost).toLocaleString()}`} deltaColor={nm.objective_cost <= bm.objective_cost ? 'green' : 'red'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Baseline: {baseline}</h3>
              <ChartContainer height={400} data={makeGantt(baseSched)} layout={{ barmode: 'stack', xaxis: { type: 'date' }, yaxis: { autorange: 'reversed' } }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">New: {newScenarioId}</h3>
              <ChartContainer height={400} data={makeGantt(newSched)} layout={{ barmode: 'stack', xaxis: { type: 'date' }, yaxis: { autorange: 'reversed' } }} />
            </div>
          </div>

          <ChartContainer
            title="KPI Comparison Radar"
            height={400}
            data={[
              { type: 'scatterpolar' as const, r: [bm.fill_rate, bm.changeover_hrs > 0 ? 1 - bm.changeover_hrs / Math.max(bm.changeover_hrs, nm.changeover_hrs) : 0, 1 - bm.objective_cost / Math.max(bm.objective_cost, nm.objective_cost, 1)], theta: ['Fill Rate', 'Changeover (inv)', 'Cost (inv)'], fill: 'toself', name: 'Baseline', line: { color: '#475569' } },
              { type: 'scatterpolar' as const, r: [nm.fill_rate, nm.changeover_hrs > 0 ? 1 - nm.changeover_hrs / Math.max(bm.changeover_hrs, nm.changeover_hrs) : 0, 1 - nm.objective_cost / Math.max(bm.objective_cost, nm.objective_cost, 1)], theta: ['Fill Rate', 'Changeover (inv)', 'Cost (inv)'], fill: 'toself', name: 'New Scenario', line: { color: '#29B5E8' } },
            ]}
            layout={{ polar: { radialaxis: { visible: true } } }}
          />

          <div className="flex gap-4">
            <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700">Save Scenario</button>
            <button onClick={handleDiscard} className="flex-1 py-2 rounded-lg bg-gray-500 text-white font-semibold hover:bg-gray-600">Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-dark-surface p-3 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function RangeInput({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 dark:text-dark-muted">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-sf-blue" />
    </div>
  );
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500 dark:text-dark-muted">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500 dark:text-dark-muted">{label}</label>
      <div className="max-h-24 overflow-y-auto space-y-0.5">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((v) => v !== o))} className="rounded text-sf-blue" />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

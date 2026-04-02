import { useState, useMemo } from 'react';
import { useScenarioStore } from '../stores/scenarioStore';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import { useURLState } from '../hooks/useURLState';
import ChartContainer from '../components/ChartContainer';
import DataTable from '../components/DataTable';
import KPICard from '../components/KPICard';
import GuidanceBanner from '../components/GuidanceBanner';
import NotesPanel from '../components/NotesPanel';
import { SNOWFLAKE_COLORS, FAMILY_COLORS, useChartLayout } from '../types/charts';
import type { ScheduleRow, KPI, ScenarioParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

export default function OptimizationResults() {
  const { selectedScenarioId: scenario, plantFilter } = useScenarioStore();
  const plantsParam = plantFilter.length > 0 ? `&plants=${plantFilter.join(',')}` : '';
  const [line, setLine] = useURLState('line', 'All Lines');
  const [invFamily, setInvFamily] = useState<string>('');

  const { data: schedule, isLoading: schedLoading } = useSnowflakeQuery<ScheduleRow[]>(
    ['schedule', scenario!, plantsParam, line],
    `/api/results/schedule?scenario=${scenario}${plantsParam}${line !== 'All Lines' ? `&line=${line}` : ''}`,
    !!scenario,
  );
  const { data: kpis } = useSnowflakeQuery<KPI[]>(
    ['result-kpis', scenario!, plantsParam],
    `/api/results/kpis?scenario=${scenario}${plantsParam}`,
    !!scenario,
  );
  const { data: params } = useSnowflakeQuery<ScenarioParams | null>(
    ['result-params', scenario!],
    `/api/results/params?scenario=${scenario}`,
    !!scenario,
  );

  const availableLines = useMemo(() => {
    const codes = [...new Set(schedule?.map((r) => r.line_code) ?? [])].sort();
    return ['All Lines', ...codes];
  }, [schedule]);

  const families = useMemo(() => [...new Set(schedule?.map((r) => r.product_family) ?? [])].sort(), [schedule]);

  const selectedFamily = invFamily || families[0] || '';
  const familySchedule = useMemo(() => schedule?.filter((r) => r.product_family === selectedFamily) ?? [], [schedule, selectedFamily]);

  const ganttData = useMemo(() => {
    if (!schedule?.length) return [];
    const grouped: Record<string, ScheduleRow[]> = {};
    for (const r of schedule) {
      const f = r.product_family;
      if (!grouped[f]) grouped[f] = [];
      grouped[f].push(r);
    }
    return Object.entries(grouped).map(([family, rows]) => ({
      type: 'bar' as const,
      y: rows.map((r) => r.line_code),
      base: rows.map((r) => r.time_slot_start),
      x: rows.map((r) => {
        const start = new Date(r.time_slot_start).getTime();
        const end = new Date(r.time_slot_end).getTime();
        return end - start;
      }),
      orientation: 'h' as const,
      name: family,
      marker: { color: FAMILY_COLORS[family] || '#29B5E8' },
      hovertext: rows.map((r) => `${r.product_code}<br>Qty: ${r.planned_qty}<br>Fill: ${(r.projected_fill_rate * 100).toFixed(1)}%`),
      hoverinfo: 'text',
    }));
  }, [schedule]);

  const prodQty = useMemo(() => {
    if (!schedule?.length) return [];
    const agg: Record<string, { qty: number; family: string }> = {};
    for (const r of schedule) {
      if (!agg[r.product_code]) agg[r.product_code] = { qty: 0, family: r.product_family };
      agg[r.product_code].qty += r.planned_qty;
    }
    return Object.entries(agg)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 20)
      .map(([code, { qty, family }]) => ({ code, qty, family }));
  }, [schedule]);

  const invTraj = useMemo(() => {
    if (!familySchedule.length) return [];
    const grouped: Record<string, number> = {};
    for (const r of familySchedule) {
      const ts = r.time_slot_start;
      grouped[ts] = (grouped[ts] || 0) + r.projected_inventory_qty;
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [familySchedule]);

  const lineKpi = useMemo(() => {
    if (!kpis?.length) return [];
    const grouped: Record<string, any> = {};
    for (const r of kpis) {
      const key = `${r.plant_name}|${r.line_code}`;
      if (!grouped[key]) {
        grouped[key] = { plant_name: r.plant_name, line_code: r.line_code, fill_rate_sum: 0, fill_rate_count: 0, changeover_hours: 0, total_planned: 0, total_demand: 0, obj_cost: 0, dos_sum: 0, dos_count: 0 };
      }
      grouped[key].fill_rate_sum += r.fill_rate || 0;
      grouped[key].fill_rate_count++;
      grouped[key].changeover_hours = Math.min(grouped[key].changeover_hours || Infinity, r.changeover_hours || 0);
      if (grouped[key].changeover_hours === Infinity) grouped[key].changeover_hours = r.changeover_hours || 0;
      grouped[key].total_planned += r.total_planned_qty || 0;
      grouped[key].total_demand += r.total_demand_qty || 0;
      grouped[key].obj_cost += r.objective_cost || 0;
      grouped[key].dos_sum += r.inventory_days_of_supply || 0;
      grouped[key].dos_count++;
    }
    return Object.values(grouped).map((g: any) => ({
      plant_name: g.plant_name,
      line_code: g.line_code,
      fill_rate: g.fill_rate_count > 0 ? g.fill_rate_sum / g.fill_rate_count : 0,
      changeover_hours: g.changeover_hours,
      total_planned: g.total_planned,
      total_demand: g.total_demand,
      objective_cost: g.obj_cost,
      dos: g.dos_count > 0 ? g.dos_sum / g.dos_count : 0,
    }));
  }, [kpis]);

  const kpiColumns: ColumnDef<any, any>[] = [
    { accessorKey: 'plant_name', header: 'Plant' },
    { accessorKey: 'line_code', header: 'Line' },
    { accessorKey: 'fill_rate', header: 'Fill Rate', cell: (p) => { const v = p.getValue() as number; return <span className={v < 0.9 ? 'text-red-500' : ''}>{(v * 100).toFixed(1)}%</span>; } },
    { accessorKey: 'changeover_hours', header: 'CO Hrs', cell: (p) => (p.getValue() as number).toFixed(1) },
    { accessorKey: 'total_planned', header: 'Planned', cell: (p) => (p.getValue() as number).toLocaleString() },
    { accessorKey: 'total_demand', header: 'Demand', cell: (p) => (p.getValue() as number).toLocaleString() },
    { accessorKey: 'objective_cost', header: 'Obj Cost', cell: (p) => `$${(p.getValue() as number).toLocaleString()}` },
    { accessorKey: 'dos', header: 'DoS', cell: (p) => (p.getValue() as number).toFixed(1) },
  ];

  const coEvents = useMemo(() => schedule?.filter((r) => r.total_changeover_time_hours > 0) ?? [], [schedule]);

  const waterfallData = useMemo(() => {
    if (!kpis?.length || !schedule?.length) return null;
    const totalDemand = kpis.reduce((s, r) => s + (r.total_demand_qty || 0), 0) / new Set(kpis.map((r) => r.line_code)).size;
    const totalPlanned = schedule.reduce((s, r) => s + r.planned_qty, 0);
    return { totalDemand, totalPlanned };
  }, [kpis, schedule]);

  if (!scenario) return <div className="p-8 text-center text-gray-500">No scenarios found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Optimization Results</h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted">Inspect the solver output for a specific scenario</p>
        </div>
        <select value={line} onChange={(e) => setLine(e.target.value)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg">
          {availableLines.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <GuidanceBanner
        title="Reading the Optimized Schedule"
        description="The Gantt chart below shows the product wheel sequence for each line. Color = product family. Hover for details. Use the line filter to focus on a specific line."
        details="The optimizer assigns products to time slots minimizing total cost (changeover + inventory holding + backorder penalties). Each bar is a production run. Gaps between bars may indicate changeover time. The waterfall chart shows overall demand fulfillment. Use the KPI table to compare line-level performance."
        variant="tip"
      />

      {params && (
        <div className="rounded-lg bg-dark-surface/50 dark:bg-dark-surface p-3 text-sm">
          <strong>Scenario:</strong> {scenario} &nbsp;|&nbsp;
          <strong>Solver:</strong> {params.solver_engine || 'CBC'} &nbsp;|&nbsp;
          <strong>Solve Time:</strong> {params.solve_time_sec ?? 'N/A'}s &nbsp;|&nbsp;
          <strong>Horizon:</strong> {params.horizon_days ?? 14} days
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2">Product Wheel Gantt Chart</h3>
        <ChartContainer
          loading={schedLoading}
          height={Math.max(350, (new Set(schedule?.map((r) => r.line_code) ?? [])).size * 60 + 100)}
          description="Horizontal bars represent production runs on each line. Color indicates product family. The wheel sequence minimizes changeover time between consecutive products."
          data={ganttData}
          layout={{
            barmode: 'stack',
            xaxis: { title: 'Time', type: 'date' },
            yaxis: { title: 'Production Line', autorange: 'reversed' },
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Production Quantity by Product</h3>
          <ChartContainer
            height={450}
            description="Top 20 products by planned production volume. Colors match product family. This shows where the optimizer allocates capacity."
            data={prodQty.length ? [{
              type: 'bar' as const,
              y: prodQty.map((r) => r.code),
              x: prodQty.map((r) => r.qty),
              orientation: 'h' as const,
              marker: { color: prodQty.map((r) => FAMILY_COLORS[r.family] || '#29B5E8') },
            }] : []}
            layout={{ xaxis: { title: 'Planned Quantity' }, yaxis: { title: 'Product' } }}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Inventory Trajectory</h3>
          <select value={selectedFamily} onChange={(e) => setInvFamily(e.target.value)} className="mb-2 px-2 py-1 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg">
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <ChartContainer
            height={450}
            description="Projected inventory level over time for the selected product family. Rising = production outpacing demand; falling = demand drawdown. Dips near zero signal potential stockout."
            data={invTraj.length ? [{
              type: 'scatter' as const,
              x: invTraj.map(([ts]) => ts),
              y: invTraj.map(([, v]) => v),
              mode: 'lines' as const,
              line: { color: '#29B5E8', width: 2 },
              name: 'Projected Inventory',
            }] : []}
            layout={{ xaxis: { title: 'Time' }, yaxis: { title: 'Inventory Qty' } }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Line-Level KPI Summary</h3>
          {lineKpi.length > 0 && <DataTable data={lineKpi} columns={kpiColumns} maxHeight={300} />}
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Changeover Event Timeline</h3>
          <ChartContainer
            height={350}
            description="Bubble chart of changeover events. Larger bubbles = longer changeover time. Clusters indicate periods of frequent product switches."
            data={coEvents.length ? (() => {
              const codes = [...new Set(coEvents.map((r) => r.line_code))];
              return codes.map((lc, i) => {
                const rows = coEvents.filter((r) => r.line_code === lc);
                return {
                  type: 'scatter' as const,
                  x: rows.map((r) => r.time_slot_start),
                  y: rows.map((r) => r.total_changeover_time_hours),
                  mode: 'markers' as const,
                  name: lc,
                  marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length], size: rows.map((r) => Math.max(r.total_changeover_time_hours * 8, 5)) },
                  text: rows.map((r) => `${r.product_code}, Qty: ${r.planned_qty}`),
                };
              });
            })() : []}
            layout={{ xaxis: { title: 'Time' }, yaxis: { title: 'Changeover Hours' } }}
          />
        </div>
      </div>

      {waterfallData && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Demand Fulfillment Waterfall</h3>
          <ChartContainer
            height={350}
            description="Waterfall showing how total demand is fulfilled. Green = production exceeds demand (surplus); red = shortfall. The total bar shows net planned production."
            data={[{
              type: 'waterfall' as const,
              x: ['Total Demand', 'Production', 'Surplus/Shortfall'],
              y: [waterfallData.totalDemand, waterfallData.totalPlanned - waterfallData.totalDemand, waterfallData.totalPlanned],
              measure: ['absolute', 'relative', 'total'],
              connector: { line: { color: '#475569' } },
              increasing: { marker: { color: '#29B5E8' } },
              decreasing: { marker: { color: '#FF6F61' } },
              totals: { marker: { color: '#11567F' } },
            }]}
            layout={{ yaxis: { title: 'Quantity' }, showlegend: false }}
          />
        </div>
      )}

      <NotesPanel page="results" entityType="scenario" entityId={scenario} />
    </div>
  );
}

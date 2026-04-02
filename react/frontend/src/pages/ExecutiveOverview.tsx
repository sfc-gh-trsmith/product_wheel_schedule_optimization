import { useMemo } from 'react';
import { useScenarioStore } from '../stores/scenarioStore';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import ChartContainer from '../components/ChartContainer';
import KPICard from '../components/KPICard';
import GuidanceBanner from '../components/GuidanceBanner';
import NotesPanel from '../components/NotesPanel';
import { SNOWFLAKE_COLORS, FAMILY_COLORS, useChartLayout } from '../types/charts';
import type { FillRateByLine, ChangeoverByPlant, DemandVsPlanned, DosByFamily, UtilizationHeatmap } from '../types';

export default function ExecutiveOverview() {
  const { selectedScenarioId: scenario, plantFilter } = useScenarioStore();
  const plantsParam = plantFilter.length > 0 ? `&plants=${plantFilter.join(',')}` : '';
  const themeLayout = useChartLayout();

  const { data: kpis } = useSnowflakeQuery<any[]>(
    ['overview-kpis', scenario!, plantsParam],
    `/api/overview/kpis?scenario=${scenario}${plantsParam}`,
    !!scenario,
  );
  const { data: fillRate, isLoading: frLoading } = useSnowflakeQuery<FillRateByLine[]>(
    ['fill-rate', scenario!],
    `/api/overview/fill-rate?scenario=${scenario}${plantsParam}`,
    !!scenario,
  );
  const { data: changeover, isLoading: coLoading } = useSnowflakeQuery<ChangeoverByPlant[]>(
    ['changeover', scenario!],
    `/api/overview/changeover?scenario=${scenario}${plantsParam}`,
    !!scenario,
  );
  const { data: dvp, isLoading: dvpLoading } = useSnowflakeQuery<DemandVsPlanned[]>(
    ['dvp', scenario!],
    `/api/overview/demand-vs-planned?scenario=${scenario}`,
    !!scenario,
  );
  const { data: dos, isLoading: dosLoading } = useSnowflakeQuery<DosByFamily[]>(
    ['dos', scenario!],
    `/api/overview/dos?scenario=${scenario}`,
    !!scenario,
  );
  const { data: util, isLoading: utilLoading } = useSnowflakeQuery<UtilizationHeatmap[]>(
    ['util', scenario!],
    `/api/overview/utilization?scenario=${scenario}`,
    !!scenario,
  );
  const { data: contracts } = useSnowflakeQuery<any[]>(['contracts-all'], '/api/explorer/contracts');

  const metrics = useMemo(() => {
    if (!kpis?.length) return null;
    const totalPlanned = kpis.reduce((s, r) => s + (r.total_planned_qty || 0), 0);
    const totalDemand = kpis.reduce((s, r) => s + (r.total_demand_qty || 0), 0);
    const globalFR = totalPlanned / Math.max(totalDemand, 1);
    const seen = new Set<string>();
    let coHrs = 0;
    let dosSum = 0;
    let dosCount = 0;
    for (const r of kpis) {
      const key = `${r.plant_name}|${r.line_code}`;
      if (!seen.has(key)) {
        seen.add(key);
        coHrs += r.changeover_hours || 0;
        dosSum += r.inventory_days_of_supply || 0;
        dosCount++;
      }
    }
    let atRisk = 0;
    if (contracts?.length) {
      for (const c of contracts) {
        if (globalFR < (c.service_level_target_fill_rate || 0)) atRisk++;
      }
    }
    return { globalFR, coHrs, avgDos: dosCount > 0 ? dosSum / dosCount : 0, atRisk };
  }, [kpis, contracts]);

  if (!scenario) return <div className="p-8 text-center text-gray-500">No scenarios found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Executive Overview</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Snowcore Contract Manufacturing — Product Wheel Schedule Optimization</p>
      </div>

      <GuidanceBanner
        title="Your Plant Performance at a Glance"
        description="This dashboard aggregates KPIs across all plants and production lines for the selected scenario. Use the sidebar to filter by plant or switch scenarios."
        details="Key metrics: Fill Rate measures demand fulfillment (target ≥ 95%). Changeover Hours tracks non-productive time between product switches. Days of Supply indicates how many days of customer demand current inventory can cover. Contracts at Risk counts SLAs where achieved fill rate falls below the contractual target."
      />

      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Global Fill Rate"
          value={metrics ? `${(metrics.globalFR * 100).toFixed(1)}%` : '—'}
          tooltip="Ratio of total planned production to total customer demand. Target ≥ 95% to meet most SLAs. Below 90% signals capacity or scheduling issues."
        />
        <KPICard
          label="Total Changeover Hrs"
          value={metrics ? metrics.coHrs.toFixed(1) : '—'}
          tooltip="Sum of all product changeover (setup/cleaning) time across lines. Lower is better — each hour of changeover is lost production capacity."
        />
        <KPICard
          label="Avg Days of Supply"
          value={metrics ? metrics.avgDos.toFixed(1) : '—'}
          tooltip="Average inventory coverage in days. Too high means excess holding cost; too low risks stockouts. Typical target: 7-14 days."
        />
        <KPICard
          label="Contracts at Risk"
          value={metrics ? String(metrics.atRisk) : '—'}
          tooltip="Number of customer contracts where the current schedule's fill rate falls below the contractual SLA target. These need immediate attention."
        />
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <h3 className="text-sm font-semibold mb-2">Fill Rate by Plant & Line</h3>
          <ChartContainer
            loading={frLoading}
            height={380}
            description="Each bar shows the fill rate for a production line. The dashed red line marks the 95% SLA threshold. Lines below the line may be under-scheduled or capacity-constrained."
            data={(() => {
              if (!fillRate?.length) return [];
              const plants = [...new Set(fillRate.map((r) => r.plant_name))];
              return plants.map((p, i) => {
                const rows = fillRate.filter((r) => r.plant_name === p);
                return {
                  type: 'bar' as const,
                  x: rows.map((r) => r.line_code),
                  y: rows.map((r) => r.fill_rate),
                  name: p,
                  marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] },
                };
              });
            })()}
            layout={{
              barmode: 'group',
              yaxis: { range: [0, 1.1], tickformat: '.0%', title: 'Fill Rate' },
              shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0.95, y1: 0.95, line: { dash: 'dash', color: '#ef4444' } }],
              annotations: [{ x: 1, y: 0.95, xref: 'paper', text: '95% SLA', showarrow: false, font: { color: '#ef4444', size: 11 } }],
            }}
          />
        </div>
        <div className="col-span-2">
          <h3 className="text-sm font-semibold mb-2">Changeover Hours by Plant</h3>
          <ChartContainer
            loading={coLoading}
            height={380}
            description="Stacked bars show changeover time by line within each plant. Product wheel sequencing minimizes these by grouping similar products."
            data={(() => {
              if (!changeover?.length) return [];
              const lines = [...new Set(changeover.map((r) => r.line_code))];
              return lines.map((lc, i) => {
                const rows = changeover.filter((r) => r.line_code === lc);
                return {
                  type: 'bar' as const,
                  y: rows.map((r) => r.plant_name),
                  x: rows.map((r) => r.changeover_hours),
                  orientation: 'h' as const,
                  name: lc,
                  marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] },
                };
              });
            })()}
            layout={{ barmode: 'stack', xaxis: { title: 'Hours' } }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Demand vs. Planned Production</h3>
          <ChartContainer
            loading={dvpLoading}
            height={350}
            description="Compare forecasted demand against optimized production quantities by product family. Gaps indicate under-production that may cause service-level misses."
            data={
              dvp?.length
                ? [
                    { type: 'bar' as const, x: dvp.map((r) => r.product_family), y: dvp.map((r) => r.total_demand_qty), name: 'Demand', marker: { color: '#475569' } },
                    { type: 'bar' as const, x: dvp.map((r) => r.product_family), y: dvp.map((r) => r.total_planned_qty), name: 'Planned', marker: { color: '#29B5E8' } },
                  ]
                : []
            }
            layout={{ barmode: 'group', yaxis: { title: 'Quantity' } }}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Inventory Days of Supply</h3>
          <ChartContainer
            loading={dosLoading}
            height={350}
            description="Average days of supply by product family. Values above 14 days suggest overproduction; below 5 days signals stockout risk."
            data={
              dos?.length
                ? [
                    {
                      type: 'bar' as const,
                      x: dos.map((r) => r.avg_dos),
                      y: dos.map((r) => r.product_family),
                      orientation: 'h' as const,
                      marker: { color: '#29B5E8' },
                    },
                  ]
                : []
            }
            layout={{ xaxis: { title: 'Days' } }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Schedule Utilization Heatmap</h3>
        <ChartContainer
          loading={utilLoading}
          height={300}
          description="Shows how fully utilized each production line is across the planning horizon. Dark = high utilization, light = idle capacity. White gaps may indicate maintenance windows or calendar exclusions."
          data={(() => {
            if (!util?.length) return [];
            const lines = [...new Set(util.map((r) => r.line_code))];
            const dates = [...new Set(util.map((r) => r.slot_date))].sort();
            const z = lines.map((lc) => dates.map((d) => {
              const r = util.find((u) => u.line_code === lc && u.slot_date === d);
              return r?.utilization ?? 0;
            }));
            return [{ type: 'heatmap' as const, z, x: dates, y: lines, colorscale: 'Blues', hoverongaps: false }];
          })()}
          layout={{ xaxis: { title: 'Date' }, yaxis: { title: 'Line' } }}
        />
      </div>

      <NotesPanel page="overview" />
    </div>
  );
}

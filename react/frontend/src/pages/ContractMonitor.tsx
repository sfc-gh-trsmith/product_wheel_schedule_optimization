import { useMemo, useState } from 'react';
import { useScenarioStore } from '../stores/scenarioStore';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import ChartContainer from '../components/ChartContainer';
import DataTable from '../components/DataTable';
import KPICard from '../components/KPICard';
import StatusBadge from '../components/StatusBadge';
import { useChartLayout } from '../types/charts';
import type { ContractCompliance, Contract, ContractItem } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

export default function ContractMonitor() {
  const { selectedScenarioId: scenario } = useScenarioStore();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: compliance } = useSnowflakeQuery<ContractCompliance[]>(
    ['compliance', scenario!],
    `/api/contracts/compliance?scenario=${scenario}`,
    !!scenario,
  );
  const { data: contracts } = useSnowflakeQuery<Contract[]>(['contracts-mon'], '/api/explorer/contracts');
  const { data: items } = useSnowflakeQuery<ContractItem[]>(
    ['items-expand', String(expandedId)],
    `/api/contracts/items?contract_id=${expandedId}`,
    expandedId !== null,
  );

  const metrics = useMemo(() => {
    if (!compliance?.length) return null;
    const onTrack = compliance.filter((r) => r.status === 'On Track').length;
    const atRisk = compliance.filter((r) => r.status === 'At Risk').length;
    const breach = compliance.filter((r) => r.status === 'Breach').length;
    const avgGap = compliance.reduce((s, r) => s + r.gap, 0) / compliance.length;
    return { onTrack, atRisk, breach, avgGap };
  }, [compliance]);

  const columns: ColumnDef<ContractCompliance, any>[] = [
    { accessorKey: 'customer_name', header: 'Customer' },
    { accessorKey: 'sla_target', header: 'SLA Target', cell: (p) => `${((p.getValue() as number) * 100).toFixed(1)}%` },
    { accessorKey: 'achieved_fill_rate', header: 'Achieved', cell: (p) => `${((p.getValue() as number) * 100).toFixed(1)}%` },
    { accessorKey: 'gap', header: 'Gap', cell: (p) => { const v = p.getValue() as number; return <span className={v >= 0 ? 'text-green-500' : 'text-red-500'}>{v >= 0 ? '+' : ''}{(v * 100).toFixed(1)}%</span>; } },
    { accessorKey: 'total_demand', header: 'Demand', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'total_planned', header: 'Planned', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.getValue() as string} /> },
  ];

  const itemCols: ColumnDef<ContractItem, any>[] = [
    { accessorKey: 'product_code', header: 'Product' },
    { accessorKey: 'product_family', header: 'Family' },
    { accessorKey: 'min_annual_volume', header: 'Min Vol', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'max_annual_volume', header: 'Max Vol', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'agreed_price_per_unit', header: 'Price/Unit', cell: (p) => `$${(p.getValue() as number)?.toFixed(2)}` },
    { accessorKey: 'priority_tier', header: 'Priority' },
  ];

  if (!scenario) return <div className="p-8 text-center text-gray-500">No scenarios found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contract Monitor</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Track contract SLA compliance against the optimized schedule</p>
      </div>

      {metrics && (
        <div className="grid grid-cols-3 gap-4">
          <KPICard label="Contracts On-Track" value={String(metrics.onTrack)} />
          <KPICard label="At-Risk / Breach" value={String(metrics.atRisk + metrics.breach)} />
          <KPICard label="Avg Fill Rate Gap" value={`${metrics.avgGap >= 0 ? '+' : ''}${(metrics.avgGap * 100).toFixed(1)}%`} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-2">Customer SLA Compliance</h3>
        {compliance && <DataTable data={compliance} columns={columns} maxHeight={350} />}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Fill Rate vs. SLA Target</h3>
          <ChartContainer
            height={400}
            data={(() => {
              if (!compliance?.length) return [];
              const traces: any[] = [];
              for (const r of compliance) {
                const color = r.achieved_fill_rate >= r.sla_target ? '#22c55e' : '#ef4444';
                traces.push({
                  type: 'scatter' as const,
                  x: [r.sla_target, r.achieved_fill_rate],
                  y: [r.customer_name, r.customer_name],
                  mode: 'lines' as const,
                  line: { color, width: 2 },
                  showlegend: false,
                });
              }
              traces.push({
                type: 'scatter' as const,
                x: compliance.map((r) => r.sla_target),
                y: compliance.map((r) => r.customer_name),
                mode: 'markers' as const,
                marker: { symbol: 'circle', size: 10, color: '#94a3b8' },
                name: 'SLA Target',
              });
              traces.push({
                type: 'scatter' as const,
                x: compliance.map((r) => r.achieved_fill_rate),
                y: compliance.map((r) => r.customer_name),
                mode: 'markers' as const,
                marker: { symbol: 'diamond', size: 10, color: '#29B5E8' },
                name: 'Achieved',
              });
              return traces;
            })()}
            layout={{ xaxis: { title: 'Fill Rate', range: [0, 1.1], tickformat: '.0%' } }}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Contract Volume Coverage</h3>
          <ChartContainer
            height={400}
            data={
              compliance?.length
                ? [
                    {
                      type: 'bar' as const,
                      y: compliance.map((r) => r.customer_name),
                      x: compliance.map((r) => Math.min(r.total_planned, r.total_demand)),
                      orientation: 'h' as const,
                      name: 'Covered',
                      marker: { color: '#29B5E8' },
                    },
                    {
                      type: 'bar' as const,
                      y: compliance.map((r) => r.customer_name),
                      x: compliance.map((r) => Math.max(r.total_demand - r.total_planned, 0)),
                      orientation: 'h' as const,
                      name: 'Gap',
                      marker: { color: '#FF6F61' },
                    },
                  ]
                : []
            }
            layout={{ barmode: 'stack', xaxis: { title: 'Volume' } }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Contract Item Detail</h3>
        <div className="space-y-2">
          {contracts?.map((c) => {
            const comp = compliance?.find((r) => r.customer_name === c.customer_name);
            const status = comp?.status || 'Unknown';
            const statusColor = status === 'On Track' ? 'text-green-500' : status === 'At Risk' ? 'text-amber-500' : 'text-red-500';

            return (
              <div key={c.contract_id}>
                <button
                  onClick={() => setExpandedId(expandedId === c.contract_id ? null : c.contract_id)}
                  className="w-full text-left rounded-lg bg-gray-50 dark:bg-dark-surface p-3 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors"
                >
                  <strong>{c.customer_name}</strong> — SLA: {(c.service_level_target_fill_rate * 100).toFixed(0)}% | Status: <span className={statusColor + ' font-semibold'}>{status}</span>
                </button>
                {expandedId === c.contract_id && items?.length && (
                  <div className="ml-4 mt-1">
                    <DataTable data={items} columns={itemCols} maxHeight={200} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import { useURLState } from '../hooks/useURLState';
import ChartContainer from '../components/ChartContainer';
import DataTable from '../components/DataTable';
import KPICard from '../components/KPICard';
import GuidanceBanner from '../components/GuidanceBanner';
import { SNOWFLAKE_COLORS, useChartLayout } from '../types/charts';
import { clsx } from 'clsx';
import type { ColumnDef } from '@tanstack/react-table';
import type { DemandLandscape, DemandTimeseries, LineCapability, ThroughputDetail, CalendarGrid, ChangeoverEntry, InventorySnapshot, Contract, ContractItem } from '../types';

const TABS = ['demand', 'lines', 'changeover', 'inventory', 'contracts'] as const;
const TAB_LABELS = ['Demand Landscape', 'Line Capabilities', 'Changeover Matrix', 'Inventory Snapshot', 'Contracts & SLAs'];

const TAB_GUIDANCE: Record<string, { title: string; description: string; details: string }> = {
  demand: {
    title: 'Demand Forecast Data',
    description: 'Customer demand forecasts that drive the production schedule. The optimizer uses this data to determine what and how much to produce.',
    details: 'Demand is aggregated by customer × product family. The heatmap reveals concentration patterns — bright cells indicate high-volume relationships that should be prioritized. The time series shows weekly demand variability that the scheduler must buffer against.',
  },
  lines: {
    title: 'Production Line Capabilities',
    description: 'Each line has different throughput rates, product qualifications, and allergen constraints that determine what it can produce.',
    details: 'Run rate ranges show production speed variability by product. Lines with narrow ranges are specialized; wide ranges indicate flexible lines. Allergen-dedicated lines can only run specific product families to avoid cross-contamination.',
  },
  changeover: {
    title: 'Changeover Times & Costs',
    description: 'The time required to clean, setup, and validate a production line when switching between products. This is the key cost the product wheel minimizes.',
    details: 'The matrix shows from→to changeover times. Product wheel scheduling sequences products to minimize total changeover time by grouping similar products together. Expensive changeovers (dark red) should be avoided in sequence.',
  },
  inventory: {
    title: 'Current Inventory Positions',
    description: 'Opening inventory levels that the optimizer uses as starting positions. Products with inventory below safety stock get production priority.',
    details: 'The scatter plot of On-Hand vs Safety Stock highlights items below the diagonal — these are below safety stock and need urgent production. Items well above the line may be over-stocked.',
  },
  contracts: {
    title: 'Customer Contracts & SLAs',
    description: 'Contractual commitments that define minimum volumes, service levels, and pricing for each customer-product combination.',
    details: 'SLA targets drive the optimizer\'s fill rate constraint. Priority tiers (Platinum/Gold/Silver) determine which customers get production preference when capacity is constrained. Max Days of Supply targets cap inventory buildup.',
  },
};

export default function DataExplorer() {
  const [tab, setTab] = useURLState('tab', 'demand');
  const guidance = TAB_GUIDANCE[tab] || TAB_GUIDANCE.demand;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Data Explorer</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Explore the source data that feeds the product wheel optimizer</p>
      </div>
      <GuidanceBanner title={guidance.title} description={guidance.description} details={guidance.details} />
      <div className="flex gap-1 border-b border-gray-200 dark:border-dark-border">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t ? 'border-sf-blue text-sf-blue' : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text',
            )}
          >
            {TAB_LABELS[i]}
          </button>
        ))}
      </div>
      {tab === 'demand' && <DemandTab />}
      {tab === 'lines' && <LinesTab />}
      {tab === 'changeover' && <ChangeoverTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'contracts' && <ContractsTab />}
    </div>
  );
}

function DemandTab() {
  const { data: dl, isLoading: dlLoad } = useSnowflakeQuery<DemandLandscape[]>(['demand-landscape'], '/api/explorer/demand-landscape');
  const { data: ts, isLoading: tsLoad } = useSnowflakeQuery<DemandTimeseries[]>(['demand-ts'], '/api/explorer/demand-timeseries');
  const themeLayout = useChartLayout();

  const totalVol = useMemo(() => dl?.reduce((s, r) => s + r.total_forecast_qty, 0) || 0, [dl]);
  const combos = dl?.length || 0;
  const weeks = useMemo(() => new Set(ts?.map((r) => r.forecast_week_start)).size, [ts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Demand Volume" value={totalVol.toLocaleString()} tooltip="Sum of all forecasted demand units across customers, products, and time periods." />
        <KPICard label="Customer-Family Combos" value={String(combos)} tooltip="Number of unique customer × product family pairings with active demand." />
        <KPICard label="Forecast Weeks" value={String(weeks)} tooltip="Number of weekly periods in the demand forecast horizon." />
      </div>
      <ChartContainer
        loading={dlLoad}
        height={400}
        title="Customer x Product Family Demand"
        description="Heatmap of demand volume by customer and product family. Bright cells = high volume. This shows where demand is concentrated."
        data={(() => {
          if (!dl?.length) return [];
          const customers = [...new Set(dl.map((r) => r.customer_name))];
          const families = [...new Set(dl.map((r) => r.product_family))];
          const z = customers.map((c) => families.map((f) => dl.find((r) => r.customer_name === c && r.product_family === f)?.total_forecast_qty || 0));
          return [{ type: 'heatmap' as const, z, x: families, y: customers, colorscale: 'Blues', hoverongaps: false }];
        })()}
      />
      {ts?.length && (
        <ChartContainer
          loading={tsLoad}
          height={350}
          title="Weekly Demand by Product Family"
          description="Stacked area chart showing weekly demand by product family. Use this to spot demand spikes or seasonal patterns."
          data={(() => {
            const families = [...new Set(ts!.map((r) => r.product_family))];
            return families.map((f, i) => {
              const rows = ts!.filter((r) => r.product_family === f);
              return { type: 'scatter' as const, x: rows.map((r) => r.forecast_week_start), y: rows.map((r) => r.forecast_qty), fill: 'tonexty' as const, name: f, stackgroup: 'one', marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] } };
            });
          })()}
          layout={{ xaxis: { title: 'Week' }, yaxis: { title: 'Forecast Qty' } }}
        />
      )}
    </div>
  );
}

function LinesTab() {
  const { data: lines } = useSnowflakeQuery<LineCapability[]>(['line-caps'], '/api/explorer/lines');
  const { data: tp } = useSnowflakeQuery<ThroughputDetail[]>(['throughput'], '/api/explorer/throughput');
  const { data: cal } = useSnowflakeQuery<CalendarGrid[]>(['calendar'], '/api/explorer/calendar');

  const columns: ColumnDef<LineCapability, any>[] = [
    { accessorKey: 'plant_name', header: 'Plant' },
    { accessorKey: 'line_code', header: 'Line' },
    { accessorKey: 'line_name', header: 'Name' },
    { accessorKey: 'line_type', header: 'Type' },
    { accessorKey: 'is_allergen_dedicated_flag', header: 'Allergen', cell: (p) => p.getValue() ? 'Yes' : 'No' },
    { accessorKey: 'product_count', header: 'Products' },
    { accessorKey: 'avg_run_rate', header: 'Avg Rate', cell: (p) => (p.getValue() as number)?.toFixed(0) },
    { accessorKey: 'min_run_rate', header: 'Min Rate', cell: (p) => (p.getValue() as number)?.toFixed(0) },
    { accessorKey: 'max_run_rate', header: 'Max Rate', cell: (p) => (p.getValue() as number)?.toFixed(0) },
  ];

  return (
    <div className="space-y-4">
      {lines && <DataTable data={lines} columns={columns} />}
      {tp?.length && (
        <ChartContainer
          title="Run Rate Distribution by Line"
          height={350}
          description="Box plots showing the range of production run rates across products for each line. Wide boxes indicate versatile lines; narrow boxes suggest specialized capacity."
          data={(() => {
            const codes = [...new Set(tp!.map((r) => r.line_code))];
            return codes.map((lc, i) => ({
              type: 'box' as const,
              y: tp!.filter((r) => r.line_code === lc).map((r) => r.run_rate_units_per_hour),
              name: lc,
              marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] },
            }));
          })()}
        />
      )}
      {cal?.length && (
        <ChartContainer
          title="Calendar Availability"
          height={300}
          description="Green cells = line available, yellow = partial, red = unavailable (maintenance/holiday). The optimizer respects this calendar when assigning production."
          data={(() => {
            const lines = [...new Set(cal!.map((r) => r.line_code))];
            const dates = [...new Set(cal!.map((r) => r.slot_date))].sort();
            const z = lines.map((lc) => dates.map((d) => cal!.find((c) => c.line_code === lc && c.slot_date === d)?.status_num ?? 0));
            return [{ type: 'heatmap' as const, z, x: dates, y: lines, colorscale: 'RdYlGn', hoverongaps: false }];
          })()}
        />
      )}
    </div>
  );
}

function ChangeoverTab() {
  const { data: lines } = useSnowflakeQuery<any[]>(['lines-all'], '/api/common/lines');
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const lineOptions = useMemo(() => {
    if (!lines?.length) return [];
    return lines.map((l: any) => ({ id: l.line_id, label: `${l.plant_name} / ${l.line_code}` }));
  }, [lines]);

  const lineId = selectedLine ?? lineOptions[0]?.id;
  const { data: co } = useSnowflakeQuery<ChangeoverEntry[]>(
    ['changeover-matrix', String(lineId)],
    `/api/explorer/changeover?line_id=${lineId}`,
    !!lineId,
  );

  return (
    <div className="space-y-4">
      <select
        value={lineId ?? ''}
        onChange={(e) => setSelectedLine(Number(e.target.value))}
        className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg"
      >
        {lineOptions.map((o: any) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {co?.length ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KPICard label="Avg Changeover (hrs)" value={(co.reduce((s, r) => s + r.changeover_time_hours, 0) / co.length).toFixed(2)} tooltip="Mean time to switch between any two products on this line." />
            <KPICard label="Min" value={Math.min(...co.map((r) => r.changeover_time_hours)).toFixed(2)} tooltip="Fastest changeover — usually between similar products in the same family." />
            <KPICard label="Max" value={Math.max(...co.map((r) => r.changeover_time_hours)).toFixed(2)} tooltip="Longest changeover — often cross-family switches requiring full CIP cleaning." />
          </div>
          <ChartContainer
            title="Changeover Time (Hours)"
            height={450}
            description="From→To changeover matrix. Dark red = expensive transitions. The product wheel algorithm sequences production to avoid the darkest cells."
            data={(() => {
              const froms = [...new Set(co.map((r) => r.from_product))];
              const tos = [...new Set(co.map((r) => r.to_product))];
              const z = froms.map((f) => tos.map((t) => co.find((r) => r.from_product === f && r.to_product === t)?.changeover_time_hours ?? 0));
              return [{ type: 'heatmap' as const, z, x: tos, y: froms, colorscale: 'YlOrRd', hoverongaps: false }];
            })()}
          />
          <ChartContainer
            title="Top 10 Most Expensive Changeovers"
            height={350}
            description="The costliest product transitions to avoid. If these appear frequently in the schedule, consider re-sequencing or dedicating a line."
            data={(() => {
              const sorted = [...co].sort((a, b) => b.changeover_time_hours - a.changeover_time_hours).slice(0, 10);
              return [{
                type: 'bar' as const,
                x: sorted.map((r) => r.changeover_time_hours),
                y: sorted.map((r) => `${r.from_product} → ${r.to_product}`),
                orientation: 'h' as const,
                marker: { color: '#FF6F61' },
              }];
            })()}
            layout={{ xaxis: { title: 'Hours' } }}
          />
        </>
      ) : (
        <p className="text-gray-500 text-sm">No changeover data for this line.</p>
      )}
    </div>
  );
}

function InventoryTab() {
  const { data: inv } = useSnowflakeQuery<InventorySnapshot[]>(['inventory'], '/api/explorer/inventory');

  const columns: ColumnDef<InventorySnapshot, any>[] = [
    { accessorKey: 'product_code', header: 'Product' },
    { accessorKey: 'product_family', header: 'Family' },
    { accessorKey: 'plant_name', header: 'Plant' },
    { accessorKey: 'on_hand_qty', header: 'On-Hand', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'safety_stock_qty', header: 'Safety Stock', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'on_order_qty', header: 'On-Order', cell: (p) => (p.getValue() as number)?.toLocaleString() },
  ];

  const aggData = useMemo(() => {
    if (!inv?.length) return { stacked: [] as any[], scatter: [] as any[] };
    const byFamPlant: Record<string, number> = {};
    for (const r of inv) {
      const key = `${r.product_family}|${r.plant_name}`;
      byFamPlant[key] = (byFamPlant[key] || 0) + r.on_hand_qty;
    }
    const families = [...new Set(inv.map((r) => r.product_family))];
    const plants = [...new Set(inv.map((r) => r.plant_name))];
    const stacked = plants.map((p, i) => ({
      type: 'bar' as const,
      y: families,
      x: families.map((f) => byFamPlant[`${f}|${p}`] || 0),
      orientation: 'h' as const,
      name: p,
      marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] },
    }));

    const byProduct: Record<string, { oh: number; ss: number; fam: string }> = {};
    for (const r of inv) {
      if (!byProduct[r.product_code]) byProduct[r.product_code] = { oh: 0, ss: 0, fam: r.product_family };
      byProduct[r.product_code].oh += r.on_hand_qty;
      byProduct[r.product_code].ss += r.safety_stock_qty;
    }
    const entries = Object.entries(byProduct);
    const famSet = [...new Set(entries.map(([, v]) => v.fam))];
    const scatter = famSet.map((f, i) => {
      const items = entries.filter(([, v]) => v.fam === f);
      return {
        type: 'scatter' as const,
        x: items.map(([, v]) => v.ss),
        y: items.map(([, v]) => v.oh),
        text: items.map(([k]) => k),
        mode: 'markers' as const,
        name: f,
        marker: { color: SNOWFLAKE_COLORS[i % SNOWFLAKE_COLORS.length] },
      };
    });

    return { stacked, scatter };
  }, [inv]);

  return (
    <div className="space-y-4">
      {aggData.stacked.length > 0 && (
        <ChartContainer
          title="On-Hand Inventory by Product Family & Plant"
          height={350}
          description="Stacked bars show inventory distribution across plants for each product family. Helps identify imbalanced stock across facilities."
          data={aggData.stacked}
          layout={{ barmode: 'stack' }}
        />
      )}
      {inv && <DataTable data={inv} columns={columns} maxHeight={300} />}
      {aggData.scatter.length > 0 && (
        <ChartContainer
          title="On-Hand vs. Safety Stock"
          height={400}
          description="Products below the diagonal line are under safety stock — production priority needed. Products far above may be over-stocked."
          data={aggData.scatter}
          layout={{
            xaxis: { title: 'Safety Stock' },
            yaxis: { title: 'On-Hand Qty' },
            shapes: [{ type: 'line', x0: 0, y0: 0, x1: 1, y1: 1, xref: 'paper', yref: 'paper', line: { dash: 'dash', color: '#475569' } }],
          }}
        />
      )}
    </div>
  );
}

function ContractsTab() {
  const { data: contracts } = useSnowflakeQuery<Contract[]>(['contracts'], '/api/explorer/contracts');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: items } = useSnowflakeQuery<ContractItem[]>(
    ['contract-items', String(expandedId)],
    `/api/explorer/contract-items?contract_id=${expandedId}`,
    expandedId !== null,
  );

  const columns: ColumnDef<Contract, any>[] = [
    { accessorKey: 'customer_name', header: 'Customer' },
    { accessorKey: 'customer_segment', header: 'Segment' },
    { accessorKey: 'contract_start_date', header: 'Start' },
    { accessorKey: 'contract_end_date', header: 'End' },
    { accessorKey: 'service_level_target_fill_rate', header: 'SLA %', cell: (p) => `${((p.getValue() as number) * 100).toFixed(0)}%` },
    { accessorKey: 'max_days_of_supply_target', header: 'DoS Target' },
    { accessorKey: 'item_count', header: 'Items' },
    { accessorKey: 'total_min_volume', header: 'Min Volume', cell: (p) => (p.getValue() as number)?.toLocaleString() },
  ];

  const itemCols: ColumnDef<ContractItem, any>[] = [
    { accessorKey: 'product_code', header: 'Product' },
    { accessorKey: 'product_family', header: 'Family' },
    { accessorKey: 'min_annual_volume', header: 'Min Vol', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'max_annual_volume', header: 'Max Vol', cell: (p) => (p.getValue() as number)?.toLocaleString() },
    { accessorKey: 'agreed_price_per_unit', header: 'Price/Unit', cell: (p) => `$${(p.getValue() as number)?.toFixed(2)}` },
    { accessorKey: 'priority_tier', header: 'Priority' },
  ];

  return (
    <div className="space-y-4">
      {contracts?.length && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KPICard label="Active Contracts" value={String(contracts.length)} tooltip="Total number of active customer contracts currently in effect." />
            <KPICard label="Avg SLA Target" value={`${((contracts.reduce((s, c) => s + c.service_level_target_fill_rate, 0) / contracts.length) * 100).toFixed(1)}%`} tooltip="Weighted average service level agreement fill rate target across all contracts." />
            <KPICard label="DoS Target Range" value={`${Math.min(...contracts.map((c) => c.max_days_of_supply_target || 0))} - ${Math.max(...contracts.map((c) => c.max_days_of_supply_target || 0))} days`} tooltip="Range of max Days of Supply targets across contracts. The optimizer caps inventory buildup per these limits." />
          </div>
          <DataTable
            data={contracts}
            columns={columns}
            onRowClick={(row) => setExpandedId(row.contract_id === expandedId ? null : row.contract_id)}
            expandedContent={(row) =>
              expandedId === row.contract_id && items?.length ? (
                <DataTable data={items} columns={itemCols} maxHeight={200} />
              ) : null
            }
          />
          <ChartContainer
            title="Total Min Annual Volume by Customer"
            height={350}
            description="Minimum contractual volume commitments by customer. Larger bars represent higher-stakes contracts."
            data={[{
              type: 'bar' as const,
              x: contracts.map((c) => c.customer_name),
              y: contracts.map((c) => c.total_min_volume),
              marker: { color: '#29B5E8' },
            }]}
            layout={{ xaxis: { tickangle: -45 } }}
          />
        </>
      )}
    </div>
  );
}

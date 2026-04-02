import { useMemo, ReactNode } from 'react';
import Plot from 'react-plotly.js';
import { useChartLayout } from '../types/charts';
import InfoTooltip from './InfoTooltip';

interface ChartContainerProps {
  data: any[];
  layout?: Record<string, any>;
  height?: number;
  loading?: boolean;
  title?: string;
  description?: string;
  children?: ReactNode;
}

export default function ChartContainer({ data, layout = {}, height = 350, loading, title, description }: ChartContainerProps) {
  const themeLayout = useChartLayout();

  const titleObj = title ? { text: title } : layout.title ? (typeof layout.title === 'string' ? { text: layout.title } : layout.title) : undefined;

  const mergedLayout = useMemo(
    () => ({
      ...themeLayout,
      ...layout,
      height,
      title: titleObj,
      autosize: true,
    }),
    [themeLayout, layout, height, titleObj],
  );

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg bg-gray-200 dark:bg-dark-surface" style={{ height }} />
    );
  }

  return (
    <div className="plotly-chart w-full">
      {description && (
        <div className="flex items-center gap-1 mb-1">
          <InfoTooltip text={description} iconSize={12} />
          <span className="text-[10px] text-gray-400 dark:text-dark-muted">Chart info</span>
        </div>
      )}
      <Plot
        data={data as any}
        layout={mergedLayout as any}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </div>
  );
}

import { useMemo, ReactNode } from 'react';
import Plot from 'react-plotly.js';
import { useChartLayout } from '../types/charts';

interface ChartContainerProps {
  data: any[];
  layout?: Record<string, any>;
  height?: number;
  loading?: boolean;
  title?: string;
  children?: ReactNode;
}

export default function ChartContainer({ data, layout = {}, height = 350, loading, title }: ChartContainerProps) {
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

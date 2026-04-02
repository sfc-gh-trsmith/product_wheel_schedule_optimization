import { clsx } from 'clsx';
import InfoTooltip from './InfoTooltip';

interface KPICardProps {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: 'green' | 'red' | 'neutral';
  icon?: React.ReactNode;
  tooltip?: string;
}

export default function KPICard({ label, value, delta, deltaColor = 'neutral', icon, tooltip }: KPICardProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500 dark:text-dark-muted">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} iconSize={12} />}
        </div>
        {icon}
      </div>
      <span className="text-2xl font-bold">{value}</span>
      {delta && (
        <span
          className={clsx('text-sm font-medium', {
            'text-green-500': deltaColor === 'green',
            'text-red-500': deltaColor === 'red',
            'text-gray-500 dark:text-dark-muted': deltaColor === 'neutral',
          })}
        >
          {delta}
        </span>
      )}
    </div>
  );
}

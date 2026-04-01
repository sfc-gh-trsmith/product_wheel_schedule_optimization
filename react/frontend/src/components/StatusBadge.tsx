import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', {
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400': status === 'On Track',
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400': status === 'At Risk',
        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400': status === 'Breach',
      })}
    >
      {status}
    </span>
  );
}

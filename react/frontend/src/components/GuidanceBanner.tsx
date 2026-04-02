import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { clsx } from 'clsx';

interface GuidanceBannerProps {
  title: string;
  description: string;
  details?: string;
  variant?: 'info' | 'tip';
}

export default function GuidanceBanner({ title, description, details, variant = 'info' }: GuidanceBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  return (
    <div className={clsx(
      'rounded-lg border p-3 text-sm',
      variant === 'info'
        ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30'
        : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30',
    )}>
      <div className="flex items-start gap-2">
        <Info className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', variant === 'info' ? 'text-sf-blue' : 'text-amber-500')} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-dark-text">{title}</div>
          <div className="text-gray-600 dark:text-dark-muted mt-0.5">{description}</div>
          {details && expanded && (
            <div className="text-gray-500 dark:text-dark-muted mt-2 text-xs leading-relaxed">{details}</div>
          )}
          {details && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-sf-blue hover:underline mt-1"
            >
              {expanded ? 'Show less' : 'Learn more'}
            </button>
          )}
        </div>
        <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

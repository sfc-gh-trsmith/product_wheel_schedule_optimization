import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface InfoTooltipProps {
  text: string;
  className?: string;
  iconSize?: number;
}

export default function InfoTooltip({ text, className, iconSize = 14 }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={clsx('relative inline-flex', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="text-gray-400 dark:text-dark-muted hover:text-sf-blue transition-colors"
      >
        <HelpCircle style={{ width: iconSize, height: iconSize }} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 text-xs leading-relaxed bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-200 dark:border-t-dark-border" />
        </div>
      )}
    </div>
  );
}

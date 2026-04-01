import { useCallback, useRef } from 'react';
import { useSolverStore } from '../stores/solverStore';
import type { SolverParams } from '../types';

export function useSolverSSE() {
  const { setRunning, addProgress, setComplete, setError } = useSolverStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  const run = useCallback(
    async (params: SolverParams) => {
      setRunning();

      try {
        const res = await fetch('/api/scenarios/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });

        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.event === 'progress') {
                  addProgress(data);
                } else if (data.event === 'complete') {
                  setComplete(data);
                } else if (data.event === 'error') {
                  setError(data.message || 'Solver error');
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Connection failed');
      }
    },
    [setRunning, addProgress, setComplete, setError],
  );

  const cancel = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { run, cancel };
}

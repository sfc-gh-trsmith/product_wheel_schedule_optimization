import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

export function useURLState(key: string, defaultValue: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (v: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === defaultValue) {
            next.delete(key);
          } else {
            next.set(key, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );

  return [value, setValue] as const;
}

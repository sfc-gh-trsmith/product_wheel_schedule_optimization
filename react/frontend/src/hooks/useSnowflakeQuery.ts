import { useQuery } from '@tanstack/react-query';

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export function useSnowflakeQuery<T>(key: string[], url: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(url),
    enabled,
    staleTime: 300_000,
  });
}

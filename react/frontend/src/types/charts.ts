export const SNOWFLAKE_COLORS = ['#29B5E8', '#11567F', '#64D2FF', '#FF6F61', '#6B8E23', '#DA70D6'];

export const FAMILY_COLORS: Record<string, string> = {
  'Premium Wet Food': '#29B5E8',
  'Standard Wet Food': '#11567F',
  'Grain-Free Wet Food': '#64D2FF',
  'Dry Kibble': '#FF6F61',
  'Treats and Snacks': '#6B8E23',
  'Limited Ingredient Diet': '#DA70D6',
};

export function darkLayout(): Record<string, any> {
  return {
    paper_bgcolor: '#0f172a',
    plot_bgcolor: '#0f172a',
    font: { color: '#e2e8f0', size: 12 },
    hoverlabel: { bgcolor: '#1e293b', bordercolor: '#334155' },
    margin: { l: 40, r: 20, t: 40, b: 40 },
  };
}

export function lightLayout(): Record<string, any> {
  return {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { color: '#1e293b', size: 12 },
    hoverlabel: { bgcolor: '#f8fafc', bordercolor: '#e2e8f0' },
    margin: { l: 40, r: 20, t: 40, b: 40 },
  };
}

import { useThemeStore } from '../stores/themeStore';

export function useChartLayout(): Record<string, any> {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'dark' ? darkLayout() : lightLayout();
}

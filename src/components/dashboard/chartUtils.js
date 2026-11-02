import { CHART_COLORS } from './dashboardChartTheme';
import {
  BarChartOutlined,
  StackedBarChartOutlined,
  ShowChartOutlined,
  TimelineOutlined,
  PieChartOutlined,
  HexagonOutlined,
  ScatterPlotOutlined,
  GridViewOutlined,
  FilterListOutlined,
  TableChartOutlined,
} from '@mui/icons-material';

export const CHART_TYPES = [
  { id: 'bar', label: 'Bar', Icon: BarChartOutlined },
  { id: 'stackedBar', label: 'Stacked Bar', Icon: StackedBarChartOutlined },
  { id: 'line', label: 'Line', Icon: ShowChartOutlined },
  { id: 'area', label: 'Area', Icon: TimelineOutlined },
  { id: 'pie', label: 'Pie / Donut', Icon: PieChartOutlined },
  { id: 'radar', label: 'Radar', Icon: HexagonOutlined },
  { id: 'scatter', label: 'Scatter', Icon: ScatterPlotOutlined },
  { id: 'treemap', label: 'Treemap', Icon: GridViewOutlined },
  { id: 'funnel', label: 'Funnel', Icon: FilterListOutlined },
  { id: 'table', label: 'Table', Icon: TableChartOutlined },
];

export const DEFAULT_COLORS = CHART_COLORS;

export function aggregateForPie(data, dataKeys) {
  return dataKeys.map((dk, i) => {
    const total = data.reduce((sum, row) => sum + (Number(row[dk.key]) || 0), 0);
    return { name: dk.label, value: Math.round(total), fill: dk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
  });
}

export function prepareTreemapData(data, dataKeys, xKey) {
  if (dataKeys.length === 1) {
    return data.map((row, i) => ({
      name: row[xKey] || `Item ${i + 1}`,
      size: Number(row[dataKeys[0].key]) || 0,
      fill: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }));
  }
  return dataKeys.map((dk, i) => {
    const total = data.reduce((sum, row) => sum + (Number(row[dk.key]) || 0), 0);
    return { name: dk.label, size: Math.round(total), fill: dk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
  });
}

export function prepareFunnelData(data, dataKeys, xKey) {
  if (dataKeys.length === 1) {
    return data
      .map((row, i) => ({
        name: row[xKey] || `Step ${i + 1}`,
        value: Number(row[dataKeys[0].key]) || 0,
        fill: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }
  return dataKeys
    .map((dk, i) => {
      const total = data.reduce((sum, row) => sum + (Number(row[dk.key]) || 0), 0);
      return { name: dk.label, value: Math.round(total), fill: dk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
    })
    .sort((a, b) => b.value - a.value);
}

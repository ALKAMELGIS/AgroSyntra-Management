import { useState, useMemo } from 'react';
import {
  Card, CardContent, Box, Typography, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
} from '@mui/material';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, Treemap, FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  CHART_TYPES, DEFAULT_COLORS,
  aggregateForPie, prepareTreemapData, prepareFunnelData,
} from './chartUtils';

import { CHART_TOOLTIP as TOOLTIP_STYLE } from './dashboardChartTheme';

function ChartCard({ title, data = [], dataKeys = [], xKey = 'name', defaultChart = 'bar', height = 300 }) {
  const [chartType, setChartType] = useState(defaultChart);
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });

  const colors = useMemo(
    () => dataKeys.map((dk, i) => dk.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
    [dataKeys],
  );

  const pieData = useMemo(() => aggregateForPie(data, dataKeys), [data, dataKeys]);
  const treemapData = useMemo(() => prepareTreemapData(data, dataKeys, xKey), [data, dataKeys, xKey]);
  const funnelData = useMemo(() => prepareFunnelData(data, dataKeys, xKey), [data, dataKeys, xKey]);

  const radarData = useMemo(() => {
    if (dataKeys.length >= 2) return data;
    return data.map((row) => ({ ...row, subject: row[xKey] }));
  }, [data, dataKeys, xKey]);

  const sortedTableData = useMemo(() => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      const cmp = typeof av === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

  const isEmpty = !data || data.length === 0;

  const renderChart = () => {
    if (isEmpty) {
      return (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', py: 8, textAlign: 'center' }}>
          No data available
        </Typography>
      );
    }

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7e2" vertical={false} />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
              {dataKeys.map((dk, i) => (
                <Bar key={dk.key} dataKey={dk.key} name={dk.label} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'stackedBar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7e2" vertical={false} />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
              {dataKeys.map((dk, i) => (
                <Bar key={dk.key} dataKey={dk.key} name={dk.label} fill={colors[i]} stackId="stack" radius={i === dataKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7e2" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
              {dataKeys.map((dk, i) => (
                <Line key={dk.key} type="monotone" dataKey={dk.key} name={dk.label} stroke={colors[i]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7e2" />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
              {dataKeys.map((dk, i) => (
                <Area key={dk.key} type="monotone" dataKey={dk.key} name={dk.label} stroke={colors[i]} fill={colors[i]} fillOpacity={0.15} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'pie': {
        const total = pieData.reduce((s, d) => s + d.value, 0);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box sx={{ position: 'relative', width: Math.min(height, 240), height: Math.min(height, 240) }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" dataKey="value" strokeWidth={2} stroke="#fff">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
                  {total.toLocaleString()}
                </Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>Total</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, mt: 2 }}>
              {pieData.map((s) => (
                <Box key={s.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.fill }} />
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{s.name}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        );
      }

      case 'radar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e3e7e2" />
              <PolarAngleAxis dataKey={dataKeys.length >= 2 ? xKey : 'subject'} tick={{ fontSize: 11, fill: '#58625c' }} />
              <PolarRadiusAxis tick={{ fontSize: 10, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
              {dataKeys.map((dk, i) => (
                <Radar key={dk.key} name={dk.label} dataKey={dk.key} stroke={colors[i]} fill={colors[i]} fillOpacity={0.2} />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        if (dataKeys.length < 2) {
          return (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', py: 8, textAlign: 'center' }}>
              Scatter plot requires at least 2 data series
            </Typography>
          );
        }
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3e7e2" />
              <XAxis dataKey={dataKeys[0].key} name={dataKeys[0].label} tick={{ fontSize: 12, fill: '#58625c' }} />
              <YAxis dataKey={dataKeys[1].key} name={dataKeys[1].label} tick={{ fontSize: 12, fill: '#58625c' }} />
              <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name={`${dataKeys[0].label} vs ${dataKeys[1].label}`} data={data} fill={colors[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'treemap':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <Treemap data={treemapData} dataKey="size" nameKey="name" stroke="#fff" fill="#1f7a4d"
              content={({ x, y, width, height: h, name, value }) => {
                if (width < 40 || h < 30) return null;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={h} rx={4} style={{ fill: treemapData.find((d) => d.name === name)?.fill || '#1f7a4d', stroke: '#fff', strokeWidth: 2 }} />
                    <text x={x + width / 2} y={y + h / 2 - 6} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={600}>{name}</text>
                    <text x={x + width / 2} y={y + h / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={11}>{(value || 0).toLocaleString()}</text>
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
        );

      case 'funnel':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <FunnelChart>
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                {funnelData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
                <LabelList position="center" fill="#fff" fontSize={12} fontWeight={600} formatter={(v) => v.toLocaleString()} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        );

      case 'table':
        return (
          <TableContainer sx={{ maxHeight: height + 60 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === xKey} direction={sortConfig.key === xKey ? sortConfig.dir : 'asc'} onClick={() => handleSort(xKey)}>
                      {xKey}
                    </TableSortLabel>
                  </TableCell>
                  {dataKeys.map((dk) => (
                    <TableCell key={dk.key} align="right">
                      <TableSortLabel active={sortConfig.key === dk.key} direction={sortConfig.key === dk.key ? sortConfig.dir : 'asc'} onClick={() => handleSort(dk.key)}>
                        {dk.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedTableData.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{row[xKey]}</TableCell>
                    {dataKeys.map((dk) => (
                      <TableCell key={dk.key} align="right">
                        {typeof row[dk.key] === 'number' ? row[dk.key].toLocaleString(undefined, { maximumFractionDigits: 2 }) : row[dk.key] ?? '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'text.primary' }}>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {CHART_TYPES.map(({ id, label, Icon }) => (
              <Tooltip key={id} title={label} arrow>
                <IconButton
                  size="small"
                  onClick={() => setChartType(id)}
                  sx={{
                    borderRadius: 1.5,
                    p: 0.5,
                    bgcolor: chartType === id ? 'primary.main' : 'transparent',
                    color: chartType === id ? 'primary.contrastText' : 'text.secondary',
                    '&:hover': { bgcolor: chartType === id ? 'primary.dark' : 'action.hover' },
                  }}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </Box>
        {renderChart()}
      </CardContent>
    </Card>
  );
}

export default ChartCard;

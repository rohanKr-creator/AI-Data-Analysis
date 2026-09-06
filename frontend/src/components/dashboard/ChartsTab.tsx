import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Activity,
  Maximize2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { DatasetProfileResponse } from '../../types/api';

interface ChartsTabProps {
  profile: DatasetProfileResponse;
}

const PALETTE = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
];

export const ChartsTab: React.FC<ChartsTabProps> = ({ profile }) => {
  const numericColumns = useMemo(
    () => Object.keys(profile.numeric_summary || {}),
    [profile]
  );

  const categoricalColumns = useMemo(
    () => profile.columns.filter((c) => c.data_type === 'string').map((c) => c.name),
    [profile]
  );

  const [chartType, setChartType] = useState<'bar' | 'area' | 'line' | 'pie'>('bar');
  const [metricCol, setMetricCol] = useState<string>(
    numericColumns.length > 0 ? numericColumns[0] : ''
  );
  const [dimensionCol, setDimensionCol] = useState<string>(
    categoricalColumns.length > 0 ? categoricalColumns[0] : ''
  );

  // Prepare chart series from preview rows
  const chartData = useMemo(() => {
    if (!profile.preview || profile.preview.length === 0) return [];

    return profile.preview.map((row, idx) => {
      const dimVal = dimensionCol ? String(row[dimensionCol] ?? `Item ${idx + 1}`) : `Row ${idx + 1}`;
      const metVal = metricCol ? Number(row[metricCol]) : 0;

      return {
        name: dimVal.length > 18 ? `${dimVal.substring(0, 15)}…` : dimVal,
        fullName: dimVal,
        value: isNaN(metVal) ? 0 : metVal,
      };
    });
  }, [profile.preview, dimensionCol, metricCol]);

  // Aggregate stats for the current chart selection
  const chartStats = useMemo(() => {
    if (chartData.length === 0) return null;
    const values = chartData.map((d) => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = sum / values.length;

    return { sum, max, min, avg };
  }, [chartData]);

  return (
    <div className="tab-pane charts-tab">
      {/* Visual controls toolbar */}
      <div className="charts-toolbar-card">
        <div className="chart-controls-grid">
          {/* Chart Type Toggle */}
          <div className="chart-control-group">
            <span className="control-label">Visualization Type</span>
            <div className="chart-type-buttons">
              <button
                className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
                onClick={() => setChartType('bar')}
              >
                <BarChart3 size={15} />
                <span>Bar</span>
              </button>
              <button
                className={`chart-type-btn ${chartType === 'area' ? 'active' : ''}`}
                onClick={() => setChartType('area')}
              >
                <Activity size={15} />
                <span>Area</span>
              </button>
              <button
                className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
                onClick={() => setChartType('line')}
              >
                <LineIcon size={15} />
                <span>Line</span>
              </button>
              <button
                className={`chart-type-btn ${chartType === 'pie' ? 'active' : ''}`}
                onClick={() => setChartType('pie')}
              >
                <PieIcon size={15} />
                <span>Donut</span>
              </button>
            </div>
          </div>

          {/* Metric Selector */}
          <div className="chart-control-group">
            <label htmlFor="chart-metric-select" className="control-label">
              Metric Axis (Y-Axis)
            </label>
            <select
              id="chart-metric-select"
              value={metricCol}
              onChange={(e) => setMetricCol(e.target.value)}
              className="saas-select"
            >
              {numericColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Dimension Selector */}
          <div className="chart-control-group">
            <label htmlFor="chart-dim-select" className="control-label">
              Grouping Axis (X-Axis)
            </label>
            <select
              id="chart-dim-select"
              value={dimensionCol}
              onChange={(e) => setDimensionCol(e.target.value)}
              className="saas-select"
            >
              <option value="">-- Sequential Rows --</option>
              {profile.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.data_type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Chart Card */}
      <div className="chart-canvas-card">
        <div className="chart-canvas-header">
          <div>
            <h3 className="chart-title">
              {metricCol.toUpperCase()} by {dimensionCol ? dimensionCol.toUpperCase() : 'OBSERVATIONS'}
            </h3>
            <p className="chart-subtitle">
              Interactive visualization with high-precision tooltip inspection
            </p>
          </div>
          <div className="chart-header-badge">
            <Maximize2 size={14} />
            <span>Interactive</span>
          </div>
        </div>

        <div className="chart-render-area">
          <ResponsiveContainer width="100%" height={380}>
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: unknown) => [
                    typeof value === 'number' ? value.toLocaleString() : String(value ?? ''),
                    metricCol,
                  ]}
                  labelFormatter={(lbl) => `Entity: ${lbl}`}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                <defs>
                  <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorArea)"
                />
              </AreaChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            ) : (
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`
                  }
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Aggregate KPI Footers */}
        {chartStats && (
          <div className="chart-stats-footer">
            <div className="chart-stat-item">
              <span className="stat-label">Peak Value</span>
              <span className="stat-value">{chartStats.max.toLocaleString()}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Minimum</span>
              <span className="stat-value">{chartStats.min.toLocaleString()}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Sample Average</span>
              <span className="stat-value">{chartStats.avg.toFixed(1)}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Sample Sum</span>
              <span className="stat-value">{chartStats.sum.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

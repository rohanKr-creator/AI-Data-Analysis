import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Activity,
  Layers,
  Sparkles,
  Database,
  RefreshCw,
  Info,
  TrendingUp,
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
import { analyzeDataset } from '../../services/api';
import type { DatasetProfileResponse, AnalyticsOperation } from '../../types/api';
import {
  getRecommendedCharts,
  isCategoricalDimension,
  isNumericMetric,
  formatChartTitle,
  getPreferredAggregation,
} from '../../utils/chartIntelligence';

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
  '#14b8a6', // Teal
  '#f97316', // Orange
];

interface ChartDataPoint {
  name: string;
  fullName: string;
  value: number;
}

function dictToChartData(dict: Record<string, unknown> | null | undefined): ChartDataPoint[] {
  if (!dict || typeof dict !== 'object') return [];
  return Object.entries(dict)
    .map(([key, val]) => {
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      return {
        name: key.length > 16 ? `${key.substring(0, 14)}…` : key,
        fullName: key,
        value: isNaN(num) ? 0 : num,
      };
    })
    .filter((d) => !isNaN(d.value));
}

export const ChartsTab: React.FC<ChartsTabProps> = ({ profile }) => {
  // Recommendations derived dynamically from schema profiling
  const recommendations = useMemo(() => getRecommendedCharts(profile), [profile]);

  // Valid non-ID dimensions and metrics
  const validDimensions = useMemo(
    () => profile.columns.filter((col) => isCategoricalDimension(col, profile)),
    [profile]
  );
  const validMetrics = useMemo(
    () => profile.columns.filter((col) => isNumericMetric(col, profile)),
    [profile]
  );

  // Chart 1 (Primary Grouped Chart) State
  const primaryRec = recommendations.find((r) => r.perspective === 'grouped_metric') || recommendations[0];
  const [primaryMetric, setPrimaryMetric] = useState<string>(
    primaryRec?.metricCol || (validMetrics[0]?.name ?? '')
  );
  const [primaryDim, setPrimaryDim] = useState<string>(
    primaryRec?.dimensionCol || (validDimensions[0]?.name ?? '')
  );
  const [primaryAgg, setPrimaryAgg] = useState<'sum' | 'mean'>(
    primaryRec?.aggregation || (primaryMetric ? getPreferredAggregation(primaryMetric) : 'sum')
  );
  const [primaryType, setPrimaryType] = useState<'bar' | 'area' | 'line' | 'pie'>('bar');
  const [primaryData, setPrimaryData] = useState<ChartDataPoint[]>([]);
  const [primaryLoading, setPrimaryLoading] = useState<boolean>(true);
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  // Chart 2 (Categorical Breakdown / Secondary Dimension) State
  const catRec = recommendations.find((r) => r.perspective === 'category_breakdown');
  const [catDim, setCatDim] = useState<string>(catRec?.dimensionCol || (validDimensions[0]?.name ?? ''));
  const [catType, setCatType] = useState<'bar' | 'pie'>('bar');
  const [catData, setCatData] = useState<ChartDataPoint[]>([]);
  const [catLoading, setCatLoading] = useState<boolean>(true);
  const [catError, setCatError] = useState<string | null>(null);

  // Chart 3 (Numeric Distribution / Histogram) State
  const numRec = recommendations.find((r) => r.perspective === 'numeric_distribution');
  const [numMetric, setNumMetric] = useState<string>(
    numRec?.metricCol || (validMetrics.length > 1 ? validMetrics[1].name : validMetrics[0]?.name ?? '')
  );
  const [numData, setNumData] = useState<ChartDataPoint[]>([]);
  const [numLoading, setNumLoading] = useState<boolean>(
    Boolean(numRec?.metricCol || validMetrics[0]?.name)
  );
  const [numError, setNumError] = useState<string | null>(null);

  const [reloadTrigger, setReloadTrigger] = useState<number>(0);
  const handleReload = () => setReloadTrigger((prev) => prev + 1);

  // Derive active values, cleanly falling back to recommended values if selection is invalid
  const activeMetric = validMetrics.some((m) => m.name === primaryMetric)
    ? primaryMetric
    : primaryRec?.metricCol || validMetrics[0]?.name || '';

  const activeDim = validDimensions.some((d) => d.name === primaryDim)
    ? primaryDim
    : primaryRec?.dimensionCol || (validDimensions[0]?.name ?? '');

  const activeCatDim = validDimensions.some((d) => d.name === catDim)
    ? catDim
    : catRec?.dimensionCol || (validDimensions[0]?.name ?? '');

  const activeNumMetric = validMetrics.some((m) => m.name === numMetric)
    ? numMetric
    : numRec?.metricCol || (validMetrics.length > 1 ? validMetrics[1].name : validMetrics[0]?.name ?? '');

  // Fetch Primary Chart Data (Aggregated across full dataset)
  useEffect(() => {
    if (!profile.dataset_id) return;
    let isCancelled = false;

    async function loadPrimary() {
      setPrimaryLoading(true);
      setPrimaryError(null);

      try {
        if (activeMetric && activeDim) {
          const res = await analyzeDataset(profile.dataset_id, {
            column: activeMetric,
            operation: primaryAgg as AnalyticsOperation,
            group_by: activeDim,
          });
          if (!isCancelled) {
            setPrimaryData(dictToChartData(res.result as Record<string, unknown>));
          }
        } else if (activeDim) {
          const res = await analyzeDataset(profile.dataset_id, {
            column: activeDim,
            operation: 'value_counts',
          });
          if (!isCancelled) {
            setPrimaryData(dictToChartData(res.result as Record<string, unknown>));
          }
        } else if (activeMetric) {
          const res = await analyzeDataset(profile.dataset_id, {
            column: activeMetric,
            operation: 'histogram',
          });
          if (!isCancelled) {
            setPrimaryData(dictToChartData(res.result as Record<string, unknown>));
          }
        } else {
          if (!isCancelled) {
            setPrimaryData([]);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setPrimaryError((err as Error).message);
        }
      } finally {
        if (!isCancelled) {
          setPrimaryLoading(false);
        }
      }
    }

    loadPrimary();
    return () => {
      isCancelled = true;
    };
  }, [profile.dataset_id, activeMetric, activeDim, primaryAgg, reloadTrigger]);

  // Fetch Categorical Breakdown Data (or fallback distribution if no dimensions)
  useEffect(() => {
    if (!profile.dataset_id) return;
    let isCancelled = false;

    async function loadCat() {
      setCatLoading(true);
      setCatError(null);

      try {
        if (activeCatDim) {
          const res = await analyzeDataset(profile.dataset_id, {
            column: activeCatDim,
            operation: 'value_counts',
          });
          if (!isCancelled) {
            setCatData(dictToChartData(res.result as Record<string, unknown>));
          }
        } else if (validMetrics.length > 1) {
          // Fallback if no categorical dimensions: show second metric distribution
          const secondMetric = validMetrics[1].name;
          const res = await analyzeDataset(profile.dataset_id, {
            column: secondMetric,
            operation: 'histogram',
          });
          if (!isCancelled) {
            setCatData(dictToChartData(res.result as Record<string, unknown>));
          }
        } else {
          if (!isCancelled) {
            setCatData([]);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setCatError((err as Error).message);
        }
      } finally {
        if (!isCancelled) {
          setCatLoading(false);
        }
      }
    }

    loadCat();
    return () => {
      isCancelled = true;
    };
  }, [profile.dataset_id, activeCatDim, validMetrics, reloadTrigger]);

  // Fetch Numeric Distribution Data
  useEffect(() => {
    if (!profile.dataset_id || !activeNumMetric) {
      return;
    }
    let isCancelled = false;

    async function loadNum() {
      setNumLoading(true);
      setNumError(null);

      try {
        const res = await analyzeDataset(profile.dataset_id, {
          column: activeNumMetric,
          operation: 'histogram',
        });
        if (!isCancelled) {
          setNumData(dictToChartData(res.result as Record<string, unknown>));
        }
      } catch {
        if (!isCancelled) {
          // Fallback to summary statistics if histogram is unavailable
          const stats = profile.numeric_summary?.[activeNumMetric];
          if (stats) {
            setNumData([
              { name: 'Min', fullName: 'Minimum', value: stats.min ?? 0 },
              { name: 'Mean', fullName: 'Mean Average', value: stats.mean ?? 0 },
              { name: 'Max', fullName: 'Maximum', value: stats.max ?? 0 },
            ]);
          } else {
            setNumError('Unable to generate distribution for this column');
          }
        }
      } finally {
        if (!isCancelled) {
          setNumLoading(false);
        }
      }
    }

    loadNum();
    return () => {
      isCancelled = true;
    };
  }, [profile.dataset_id, profile.numeric_summary, activeNumMetric, reloadTrigger]);

  // Primary chart summary statistics
  const primaryStats = useMemo(() => {
    if (primaryData.length === 0) return null;
    const values = primaryData.map((d) => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = sum / values.length;
    return { sum, max, min, avg };
  }, [primaryData]);

  // Primary chart header title
  const primaryTitle = useMemo(() => {
    if (activeMetric && activeDim) {
      return formatChartTitle(activeMetric, activeDim, primaryAgg);
    }
    if (activeDim) {
      return `Frequency Breakdown by ${activeDim}`;
    }
    if (activeMetric) {
      return `${activeMetric} Distribution`;
    }
    return 'Dataset Visual Inspection';
  }, [activeMetric, activeDim, primaryAgg]);

  return (
    <div className="tab-pane charts-tab">
      {/* Top Banner: Insights & Dataset Scope */}
      <div className="charts-banner-card">
        <div className="charts-banner-content">
          <div className="charts-banner-text">
            <div className="charts-banner-tag">
              <Sparkles size={14} />
              <span>Full-Dataset Visual Intelligence</span>
            </div>
            <h2 className="charts-banner-title">Automated Multi-Perspective Analytics</h2>
            <p className="charts-banner-desc">
              Charts are calculated directly by the backend analytics engine over all{' '}
              <strong>{profile.row_count.toLocaleString()} rows</strong>. Unique identifiers (e.g. IDs, hashes)
              are automatically excluded to highlight real business patterns.
            </p>
          </div>
          <div className="charts-banner-meta">
            <div className="banner-meta-badge">
              <Database size={14} />
              <span>{profile.row_count.toLocaleString()} Total Rows</span>
            </div>
            <div className="banner-meta-badge">
              <Layers size={14} />
              <span>{validDimensions.length} Valid Dimensions</span>
            </div>
            <div className="banner-meta-badge">
              <TrendingUp size={14} />
              <span>{validMetrics.length} Valid Metrics</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart Card (Cross-Feature Grouped Aggregation) */}
      <div className="chart-canvas-card featured-chart-card">
        <div className="chart-canvas-header">
          <div>
            <div className="chart-header-pretitle">
              <span className="perspective-pill">Perspective 1: Grouped Aggregation</span>
              <span className="dataset-scope-pill">All {profile.row_count.toLocaleString()} Rows</span>
            </div>
            <h3 className="chart-title">{primaryTitle}</h3>
            <p className="chart-subtitle">
              Cross-feature analytical aggregation computed across the entire dataset
            </p>
          </div>
          <div className="chart-type-buttons">
            <button
              className={`chart-type-btn ${primaryType === 'bar' ? 'active' : ''}`}
              onClick={() => setPrimaryType('bar')}
              title="Bar Chart"
            >
              <BarChart3 size={15} />
              <span>Bar</span>
            </button>
            <button
              className={`chart-type-btn ${primaryType === 'area' ? 'active' : ''}`}
              onClick={() => setPrimaryType('area')}
              title="Area Chart"
            >
              <Activity size={15} />
              <span>Area</span>
            </button>
            <button
              className={`chart-type-btn ${primaryType === 'line' ? 'active' : ''}`}
              onClick={() => setPrimaryType('line')}
              title="Line Chart"
            >
              <LineIcon size={15} />
              <span>Line</span>
            </button>
            <button
              className={`chart-type-btn ${primaryType === 'pie' ? 'active' : ''}`}
              onClick={() => setPrimaryType('pie')}
              title="Donut Chart"
            >
              <PieIcon size={15} />
              <span>Donut</span>
            </button>
          </div>
        </div>

        {/* Interactive Controls Toolbar for Primary Chart */}
        <div className="chart-toolbar-inline">
          <div className="chart-control-group">
            <label htmlFor="primary-metric-select" className="control-label">
              Quantitative Metric (Y-Axis)
            </label>
            <select
              id="primary-metric-select"
              value={activeMetric}
              onChange={(e) => {
                const newMetric = e.target.value;
                setPrimaryMetric(newMetric);
                setPrimaryAgg(getPreferredAggregation(newMetric));
              }}
              className="saas-select"
            >
              {validMetrics.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.data_type})
                </option>
              ))}
            </select>
          </div>

          <div className="chart-control-group">
            <label htmlFor="primary-dim-select" className="control-label">
              Categorical Grouping (X-Axis)
            </label>
            <select
              id="primary-dim-select"
              value={activeDim}
              onChange={(e) => setPrimaryDim(e.target.value)}
              className="saas-select"
            >
              {validDimensions.length > 0 ? (
                <>
                  <option value="">None (Distribution Histogram)</option>
                  {validDimensions.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name} {col.unique_count !== undefined ? `(${col.unique_count} categories)` : ''}
                    </option>
                  ))}
                </>
              ) : (
                <option value="">None (Distribution Histogram)</option>
              )}
            </select>
          </div>

          <div className="chart-control-group">
            <label htmlFor="primary-agg-select" className="control-label">
              Aggregation Method
            </label>
            <select
              id="primary-agg-select"
              value={primaryAgg}
              onChange={(e) => setPrimaryAgg(e.target.value as 'sum' | 'mean')}
              disabled={!primaryDim}
              className="saas-select"
            >
              <option value="sum">Sum (Total)</option>
              <option value="mean">Mean (Average)</option>
            </select>
          </div>

          <button
            className="chart-refresh-btn"
            onClick={handleReload}
            title="Re-aggregate full dataset"
          >
            <RefreshCw size={14} className={primaryLoading ? 'spinning' : ''} />
            <span>Recompute</span>
          </button>
        </div>

        {/* Primary Chart Canvas */}
        <div className="chart-render-area">
          {primaryLoading ? (
            <div className="chart-loading-placeholder">
              <div className="spinner-medium" />
              <span>Querying backend analytics for full dataset aggregation...</span>
            </div>
          ) : primaryError ? (
            <div className="chart-error-placeholder">
              <Info size={20} />
              <span>{primaryError}</span>
            </div>
          ) : primaryData.length === 0 ? (
            <div className="chart-empty-placeholder">
              <span>No observations found for this pairing.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              {primaryType === 'bar' ? (
                <BarChart data={primaryData} margin={{ top: 20, right: 30, left: 15, bottom: 45 }}>
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
                    formatter={(val: unknown) => [
                      typeof val === 'number' ? val.toLocaleString() : String(val),
                      primaryDim ? `${primaryAgg.toUpperCase()} of ${primaryMetric}` : `Observations (${primaryMetric})`,
                    ]}
                    labelFormatter={(lbl) => (primaryDim ? `Group: ${lbl}` : `Bin: ${lbl}`)}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : primaryType === 'area' ? (
                <AreaChart data={primaryData} margin={{ top: 20, right: 30, left: 15, bottom: 45 }}>
                  <defs>
                    <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
                    formatter={(val: unknown) => [
                      typeof val === 'number' ? val.toLocaleString() : String(val),
                      primaryDim ? `${primaryAgg.toUpperCase()} of ${primaryMetric}` : `Observations (${primaryMetric})`,
                    ]}
                    labelFormatter={(lbl) => (primaryDim ? `Group: ${lbl}` : `Bin: ${lbl}`)}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#primaryAreaGrad)"
                  />
                </AreaChart>
              ) : primaryType === 'line' ? (
                <LineChart data={primaryData} margin={{ top: 20, right: 30, left: 15, bottom: 45 }}>
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
                    formatter={(val: unknown) => [
                      typeof val === 'number' ? val.toLocaleString() : String(val),
                      primaryDim ? `${primaryAgg.toUpperCase()} of ${primaryMetric}` : `Observations (${primaryMetric})`,
                    ]}
                    labelFormatter={(lbl) => (primaryDim ? `Group: ${lbl}` : `Bin: ${lbl}`)}
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
                    data={primaryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={125}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {primaryData.map((_, index) => (
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
                    formatter={(val: unknown) => [
                      typeof val === 'number' ? val.toLocaleString() : String(val),
                      primaryDim ? `${primaryAgg.toUpperCase()} of ${primaryMetric}` : `Observations (${primaryMetric})`,
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              )}
            </ResponsiveContainer>
          )}
        </div>

        {/* Aggregated KPI Summary */}
        {primaryStats && (
          <div className="chart-stats-footer">
            <div className="chart-stat-item">
              <span className="stat-label">Peak Category</span>
              <span className="stat-value">{primaryStats.max.toLocaleString()}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Minimum Category</span>
              <span className="stat-value">{primaryStats.min.toLocaleString()}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Average</span>
              <span className="stat-value">{primaryStats.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            </div>
            <div className="chart-stat-item">
              <span className="stat-label">Sum</span>
              <span className="stat-value">{primaryStats.sum.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Secondary Multi-Chart Grid (Perspectives 2 & 3) */}
      <div className="charts-secondary-grid">
        {/* Card 2: Categorical Breakdown (Value Counts) or Secondary Distribution */}
        <div className="chart-canvas-card">
          <div className="chart-canvas-header">
            <div>
              <div className="chart-header-pretitle">
                <span className="perspective-pill">
                  {activeCatDim ? 'Perspective 2: Category Frequency' : 'Perspective 2: Secondary Distribution'}
                </span>
              </div>
              <h3 className="chart-title">
                {activeCatDim
                  ? `Record Volume by ${activeCatDim}`
                  : validMetrics.length > 1
                  ? `${validMetrics[1].name} Distribution`
                  : 'Categorical Breakdown'}
              </h3>
              <p className="chart-subtitle">
                {activeCatDim
                  ? 'Value count breakdown across all records in dataset'
                  : 'Frequency distribution across binned ranges in full dataset'}
              </p>
            </div>
            <div className="chart-mini-controls">
              {validDimensions.length > 1 && (
                <select
                  value={activeCatDim}
                  onChange={(e) => setCatDim(e.target.value)}
                  className="saas-select-sm"
                >
                  {validDimensions.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {activeCatDim && (
                <div className="chart-type-buttons">
                  <button
                    className={`chart-type-btn ${catType === 'bar' ? 'active' : ''}`}
                    onClick={() => setCatType('bar')}
                    title="Bar Chart"
                  >
                    <BarChart3 size={13} />
                  </button>
                  <button
                    className={`chart-type-btn ${catType === 'pie' ? 'active' : ''}`}
                    onClick={() => setCatType('pie')}
                    title="Donut Chart"
                  >
                    <PieIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="chart-render-area">
            {catLoading ? (
              <div className="chart-loading-placeholder">
                <div className="spinner-small" />
                <span>Aggregating data across dataset...</span>
              </div>
            ) : catError ? (
              <div className="chart-error-placeholder">
                <Info size={16} />
                <span>{catError}</span>
              </div>
            ) : catData.length === 0 ? (
              <div className="chart-empty-placeholder">
                <span>No categorical data available.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                {catType === 'bar' || !activeCatDim ? (
                  <BarChart data={catData} margin={{ top: 10, right: 15, left: 0, bottom: 35 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={11}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                      }}
                      formatter={(val: unknown) => [
                        `${typeof val === 'number' ? val.toLocaleString() : String(val)} ${activeCatDim ? 'records' : 'observations'}`,
                        activeCatDim ? 'Count' : 'Frequency',
                      ]}
                    />
                    <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`
                      }
                    >
                      {catData.map((_, index) => (
                        <Cell key={`cat-cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
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
                  </PieChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Card 3: Numeric Distribution / Histogram */}
        <div className="chart-canvas-card">
          <div className="chart-canvas-header">
            <div>
              <div className="chart-header-pretitle">
                <span className="perspective-pill">Perspective 3: Quantitative Distribution</span>
              </div>
              <h3 className="chart-title">{activeNumMetric || 'Metric'} Frequency Histogram</h3>
              <p className="chart-subtitle">Binned observations across all records</p>
            </div>
            <div className="chart-mini-controls">
              {validMetrics.length > 1 && (
                <select
                  value={activeNumMetric}
                  onChange={(e) => setNumMetric(e.target.value)}
                  className="saas-select-sm"
                >
                  {validMetrics.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="chart-render-area">
            {numLoading ? (
              <div className="chart-loading-placeholder">
                <div className="spinner-small" />
                <span>Computing distribution bins...</span>
              </div>
            ) : numError ? (
              <div className="chart-error-placeholder">
                <Info size={16} />
                <span>{numError}</span>
              </div>
            ) : numData.length === 0 ? (
              <div className="chart-empty-placeholder">
                <span>No quantitative data available.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={numData} margin={{ top: 10, right: 15, left: 0, bottom: 35 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={11}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: unknown) => [
                      `${typeof val === 'number' ? val.toLocaleString() : String(val)} observations`,
                      'Frequency',
                    ]}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Quick Statistical Summary for Numeric Metric */}
          {profile.numeric_summary?.[activeNumMetric] && (
            <div className="chart-stats-footer-mini">
              <div className="stat-mini">
                <span className="stat-mini-label">Mean:</span>
                <span className="stat-mini-value">
                  {profile.numeric_summary[activeNumMetric].mean?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? 'N/A'}
                </span>
              </div>
              <div className="stat-mini">
                <span className="stat-mini-label">Min:</span>
                <span className="stat-mini-value">
                  {profile.numeric_summary[activeNumMetric].min?.toLocaleString() ?? 'N/A'}
                </span>
              </div>
              <div className="stat-mini">
                <span className="stat-mini-label">Max:</span>
                <span className="stat-mini-value">
                  {profile.numeric_summary[activeNumMetric].max?.toLocaleString() ?? 'N/A'}
                </span>
              </div>
              <div className="stat-mini">
                <span className="stat-mini-label">Std Dev:</span>
                <span className="stat-mini-value">
                  {profile.numeric_summary[activeNumMetric].std?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? 'N/A'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Calculator,
  Play,
  Sparkles,
  BarChart2,
  Table as TableIcon,
  AlertCircle,
  Hash,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { analyzeDataset } from '../../services/api';
import type {
  AnalyticsOperation,
  AnalyticsResponse,
  DatasetProfileResponse,
} from '../../types/api';

interface AnalysisTabProps {
  datasetId: string;
  profile: DatasetProfileResponse;
  onAnalysisExecuted?: (res: AnalyticsResponse) => void;
}

const OPERATIONS: { value: AnalyticsOperation; label: string; description: string }[] = [
  { value: 'mean', label: 'Mean (Average)', description: 'Calculates the arithmetic average' },
  { value: 'sum', label: 'Sum', description: 'Calculates the total sum of values' },
  { value: 'median', label: 'Median (50th %)', description: 'Finds the middle numerical value' },
  { value: 'std', label: 'Standard Deviation', description: 'Measures dispersion / variability' },
  { value: 'min', label: 'Minimum', description: 'Finds the smallest value in series' },
  { value: 'max', label: 'Maximum', description: 'Finds the highest value in series' },
  { value: 'count', label: 'Count (Non-null)', description: 'Counts observed non-null records' },
  { value: 'value_counts', label: 'Value Counts', description: 'Frequency distribution of values' },
];

export const AnalysisTab: React.FC<AnalysisTabProps> = ({
  datasetId,
  profile,
  onAnalysisExecuted,
}) => {
  const [selectedColumn, setSelectedColumn] = useState<string>(
    profile.columns.length > 0 ? profile.columns[0].name : ''
  );
  const [selectedOp, setSelectedOp] = useState<AnalyticsOperation>('mean');
  const [groupByColumn, setGroupByColumn] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AnalyticsResponse | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual');

  const defaultCol = profile.columns.length > 0 ? profile.columns[0].name : '';
  const currentColumn =
    selectedColumn && profile.columns.some((c) => c.name === selectedColumn)
      ? selectedColumn
      : defaultCol;

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentColumn) {
      setError('Please select a target column.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await analyzeDataset(datasetId, {
        column: currentColumn,
        operation: selectedOp,
        group_by: groupByColumn.trim() !== '' ? groupByColumn : null,
      });
      setResponse(res);
      onAnalysisExecuted?.(res);
    } catch (err) {
      setError((err as Error).message);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  // Convert dictionary result to Recharts-friendly data points
  const chartData = React.useMemo(() => {
    if (!response || typeof response.result !== 'object' || response.result === null) {
      return [];
    }
    const obj = response.result as Record<string, unknown>;
    const keys = Object.keys(obj);

    // If flat mapping: key -> number
    return keys
      .map((key) => {
        const val = obj[key];
        const numVal = typeof val === 'number' ? val : parseFloat(String(val));
        return {
          name: key.length > 15 ? `${key.substring(0, 15)}…` : key,
          fullName: key,
          value: isNaN(numVal) ? 0 : numVal,
        };
      })
      .filter((d) => !isNaN(d.value))
      .slice(0, 15);
  }, [response]);

  const renderResult = () => {
    if (!response) return null;
    const { result, operation, column, group_by, row_count } = response;

    if (result === null || result === undefined) {
      return <div className="result-scalar-box">No observations or result was null.</div>;
    }

    // Scalar result (single number or string)
    if (typeof result !== 'object') {
      return (
        <div className="result-scalar-card">
          <div className="scalar-eyebrow">
            <span>{operation.toUpperCase()} OF {column.toUpperCase()}</span>
          </div>
          <div className="scalar-big-value">
            {typeof result === 'number' ? result.toLocaleString() : String(result)}
          </div>
          <div className="scalar-caption">
            Computed across {row_count.toLocaleString()} valid observations using deterministic Pandas backend
          </div>
        </div>
      );
    }

    const obj = result as Record<string, unknown>;
    const keys = Object.keys(obj);
    const isNested = keys.length > 0 && typeof obj[keys[0]] === 'object' && obj[keys[0]] !== null;

    return (
      <div className="result-complex-card">
        <div className="result-view-switch">
          <button
            className={`btn-pill ${viewMode === 'visual' ? 'active' : ''}`}
            onClick={() => setViewMode('visual')}
          >
            <BarChart2 size={13} />
            <span>Chart View</span>
          </button>
          <button
            className={`btn-pill ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            <TableIcon size={13} />
            <span>Table View</span>
          </button>
        </div>

        {viewMode === 'visual' && chartData.length > 0 && !isNested ? (
          <div className="result-chart-wrapper">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  angle={-30}
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
                    operation,
                  ]}
                  labelFormatter={(label) => `Category: ${label}`}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="result-table-wrapper">
            {isNested ? (
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Group ({group_by})</th>
                    <th>Sub-category ({column})</th>
                    <th>Calculated Value</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((grpKey) => {
                    const subObj = (obj[grpKey] || {}) as Record<string, unknown>;
                    const subKeys = Object.keys(subObj);
                    return subKeys.map((subKey, subIdx) => (
                      <tr key={`${grpKey}-${subKey}`}>
                        {subIdx === 0 && (
                          <td rowSpan={subKeys.length}>
                            <strong>{grpKey}</strong>
                          </td>
                        )}
                        <td>{subKey}</td>
                        <td>
                          <code>{String(subObj[subKey])}</code>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            ) : (
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>{group_by || column || 'Key'}</th>
                    <th>{operation.toUpperCase()}</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key}>
                      <td>
                        <strong>{key}</strong>
                      </td>
                      <td>
                        <code>
                          {typeof obj[key] === 'number'
                            ? (obj[key] as number).toLocaleString()
                            : String(obj[key])}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tab-pane analysis-tab">
      <div className="analysis-grid">
        {/* Left Form Panel */}
        <div className="analysis-form-card">
          <div className="panel-header">
            <Calculator size={18} className="panel-icon" />
            <div>
              <h3 className="panel-title">Calculation Parameters</h3>
              <p className="panel-subtitle">Configure deterministic Pandas analytical query</p>
            </div>
          </div>

          <form onSubmit={handleRunAnalysis} className="saas-form">
            <div className="form-field">
              <label htmlFor="workbench-column">Target Column</label>
              <select
                id="workbench-column"
                value={currentColumn}
                onChange={(e) => setSelectedColumn(e.target.value)}
                className="saas-select"
              >
                {profile.columns.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.data_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="workbench-op">Analytical Operation</label>
              <select
                id="workbench-op"
                value={selectedOp}
                onChange={(e) => setSelectedOp(e.target.value as AnalyticsOperation)}
                className="saas-select"
              >
                {OPERATIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="workbench-groupby">
                Group By <span className="label-tag">(Optional)</span>
              </label>
              <select
                id="workbench-groupby"
                value={groupByColumn}
                onChange={(e) => setGroupByColumn(e.target.value)}
                className="saas-select"
              >
                <option value="">-- No Grouping (Total Column) --</option>
                {profile.columns.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.data_type})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !currentColumn}
              className="btn btn-primary btn-block btn-with-icon"
            >
              <Play size={15} />
              <span>{loading ? 'Executing on Pandas Engine...' : 'Run Analysis'}</span>
            </button>
          </form>

          {error && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={16} />
              <div>
                <strong>Calculation Error:</strong> {error}
              </div>
            </div>
          )}
        </div>

        {/* Right Result Panel */}
        <div className="analysis-result-panel">
          <div className="panel-header">
            <Sparkles size={18} className="panel-icon icon-sparkle" />
            <div>
              <h3 className="panel-title">Computed Insights</h3>
              <p className="panel-subtitle">Deterministic output and visual representation</p>
            </div>
          </div>

          {response ? (
            <div className="result-display-area">
              <div className="result-badges-row">
                <span className="badge badge-indigo">
                  <Hash size={12} /> {response.operation}
                </span>
                <span className="badge badge-neutral">Col: {response.column}</span>
                {response.group_by && (
                  <span className="badge badge-purple">Grouped by: {response.group_by}</span>
                )}
                <span className="badge badge-emerald">{response.row_count} rows calculated</span>
              </div>

              {renderResult()}
            </div>
          ) : (
            <div className="analysis-empty-placeholder">
              <Calculator size={36} className="placeholder-icon" />
              <h4>Ready to compute</h4>
              <p>Select your parameters on the left and click "Run Analysis" to view results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

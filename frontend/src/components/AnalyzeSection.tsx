import React, { useState } from 'react';
import { analyzeDataset } from '../services/api';
import type {
  AnalyticsOperation,
  AnalyticsResponse,
  DatasetProfileResponse,
} from '../types/api';

interface AnalyzeSectionProps {
  datasetId: string | null;
  profile: DatasetProfileResponse | null;
}

const OPERATIONS: { value: AnalyticsOperation; label: string }[] = [
  { value: 'mean', label: 'Mean (Average)' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'count', label: 'Count (Non-null)' },
  { value: 'median', label: 'Median' },
  { value: 'std', label: 'Standard Deviation' },
  { value: 'value_counts', label: 'Value Counts (Frequency)' },
];

export const AnalyzeSection: React.FC<AnalyzeSectionProps> = ({
  datasetId,
  profile,
}) => {
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [selectedOp, setSelectedOp] = useState<AnalyticsOperation>('mean');
  const [groupByColumn, setGroupByColumn] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AnalyticsResponse | null>(null);

  if (!datasetId || !profile) {
    return (
      <section className="card">
        <h2>3. Analyze Dataset</h2>
        <p className="placeholder-text">
          Upload a dataset above to run statistical and aggregate operations.
        </p>
      </section>
    );
  }

  const defaultCol = profile.columns.length > 0 ? profile.columns[0].name : '';
  const currentColumn =
    selectedColumn && profile.columns.some((c) => c.name === selectedColumn)
      ? selectedColumn
      : defaultCol;

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentColumn) {
      setError('Please select a column to analyze.');
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
    } catch (err) {
      setError((err as Error).message);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const renderResult = (result: unknown) => {
    if (result === null || result === undefined) {
      return <em>None / Null</em>;
    }

    if (
      typeof result === 'number' ||
      typeof result === 'string' ||
      typeof result === 'boolean'
    ) {
      return (
        <div className="scalar-result">
          <span className="scalar-value">{String(result)}</span>
        </div>
      );
    }

    if (typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      const keys = Object.keys(obj);

      if (keys.length === 0) {
        return <em>Empty result</em>;
      }

      // Check if nested (e.g. grouped value_counts)
      const isNested = typeof obj[keys[0]] === 'object' && obj[keys[0]] !== null;

      if (isNested) {
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th>Group ({response?.group_by || 'Group'})</th>
                <th>Sub-category ({response?.column || 'Category'})</th>
                <th>Count</th>
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
                    <td>{String(subObj[subKey])}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        );
      }

      // Flat dictionary (e.g. value_counts or grouped aggregate)
      return (
        <table className="data-table">
          <thead>
            <tr>
              <th>{response?.group_by || response?.column || 'Key'}</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td><strong>{key}</strong></td>
                <td>
                  {obj[key] === null || obj[key] === undefined
                    ? '-'
                    : String(obj[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return <pre>{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <section className="card">
      <h2>3. Analyze Dataset</h2>
      <form onSubmit={handleRunAnalysis} className="analyze-form">
        <div className="form-group">
          <label htmlFor="analyze-column-select">Column:</label>
          <select
            id="analyze-column-select"
            value={currentColumn}
            onChange={(e) => setSelectedColumn(e.target.value)}
          >
            {profile.columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name} ({col.data_type})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="analyze-op-select">Operation:</label>
          <select
            id="analyze-op-select"
            value={selectedOp}
            onChange={(e) => setSelectedOp(e.target.value as AnalyticsOperation)}
          >
            {OPERATIONS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="analyze-groupby-select">Group By (Optional):</label>
          <select
            id="analyze-groupby-select"
            value={groupByColumn}
            onChange={(e) => setGroupByColumn(e.target.value)}
          >
            <option value="">-- No grouping --</option>
            {profile.columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name} ({col.data_type})
              </option>
            ))}
          </select>
        </div>

        <button
          id="run-analysis-button"
          type="submit"
          disabled={loading || !currentColumn}
        >
          {loading ? 'Calculating...' : 'Run Analysis'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" role="alert">
          <strong>Analysis Error:</strong> {error}
        </div>
      )}

      {response && (
        <div className="result-container">
          <h3>Analysis Result</h3>
          <div className="result-meta">
            <span><strong>Operation:</strong> {response.operation}</span>
            <span><strong>Target Column:</strong> {response.column}</span>
            {response.group_by && (
              <span><strong>Group By:</strong> {response.group_by}</span>
            )}
            <span><strong>Rows Analyzed:</strong> {response.row_count}</span>
          </div>

          <div className="result-output">
            {renderResult(response.result)}
          </div>
        </div>
      )}
    </section>
  );
};

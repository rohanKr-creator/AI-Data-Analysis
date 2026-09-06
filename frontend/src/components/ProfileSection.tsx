import React from 'react';
import type { DatasetProfileResponse } from '../types/api';

interface ProfileSectionProps {
  profile: DatasetProfileResponse | null;
  loading: boolean;
  error: string | null;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profile,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <section className="card">
        <h2>2. Dataset Profile</h2>
        <div className="status-message">Loading profile for dataset...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card">
        <h2>2. Dataset Profile</h2>
        <div className="alert alert-error" role="alert">
          <strong>Profile Error:</strong> {error}
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="card">
        <h2>2. Dataset Profile</h2>
        <p className="placeholder-text">
          No dataset loaded. Upload a dataset above to generate and view its profile.
        </p>
      </section>
    );
  }

  const numericColumns = Object.keys(profile.numeric_summary || {});
  const previewHeaders =
    profile.preview && profile.preview.length > 0
      ? Object.keys(profile.preview[0])
      : profile.columns.map((c) => c.name);

  return (
    <section className="card">
      <h2>2. Dataset Profile: {profile.filename}</h2>

      {/* Overview */}
      <div className="profile-overview">
        <span><strong>Rows:</strong> {profile.row_count}</span>
        <span><strong>Columns:</strong> {profile.column_count}</span>
      </div>

      {/* Column Schema & Null counts */}
      <div className="table-wrapper">
        <h3>Column Schema & Missing Values</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Column Name</th>
              <th>Data Type</th>
              <th>Null Count</th>
              <th>Null %</th>
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((col) => (
              <tr key={col.name}>
                <td><strong>{col.name}</strong></td>
                <td><code>{col.data_type}</code></td>
                <td>{col.null_count}</td>
                <td>{col.null_percentage.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Numeric Stats */}
      {numericColumns.length > 0 && (
        <div className="table-wrapper">
          <h3>Numeric Summary Statistics</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Mean</th>
                <th>Std Dev</th>
                <th>Min</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {numericColumns.map((colName) => {
                const stats = profile.numeric_summary[colName];
                return (
                  <tr key={colName}>
                    <td><strong>{colName}</strong></td>
                    <td>{stats.mean !== null && stats.mean !== undefined ? stats.mean.toFixed(4) : '-'}</td>
                    <td>{stats.std !== null && stats.std !== undefined ? stats.std.toFixed(4) : '-'}</td>
                    <td>{stats.min !== null && stats.min !== undefined ? stats.min : '-'}</td>
                    <td>{stats.max !== null && stats.max !== undefined ? stats.max : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5-Row Preview */}
      <div className="table-wrapper">
        <h3>Data Preview (First 5 Rows)</h3>
        {profile.preview && profile.preview.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  {previewHeaders.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.preview.map((row, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    {previewHeaders.map((header) => (
                      <td key={header}>
                        {row[header] === null || row[header] === undefined
                          ? <span className="null-indicator">null</span>
                          : String(row[header])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No preview rows available.</p>
        )}
      </div>
    </section>
  );
};

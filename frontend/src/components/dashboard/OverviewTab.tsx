import React from 'react';
import {
  Rows3,
  Columns3,
  ShieldCheck,
  AlertTriangle,
  HardDrive,
  Calculator,
  BarChart3,
  Bot,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import type { DatasetProfileResponse, DatasetUploadResponse } from '../../types/api';
import type { DashboardTab } from '../../types/dashboard';
import { MetricCard } from '../common/MetricCard';
import { calculateQualityReport } from '../../services/aiAnalystService';

interface OverviewTabProps {
  uploadedDataset: DatasetUploadResponse | null;
  profile: DatasetProfileResponse;
  onNavigateTab: (tab: DashboardTab) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  uploadedDataset,
  profile,
  onNavigateTab,
}) => {
  const quality = calculateQualityReport(profile);
  const numericCols = Object.keys(profile.numeric_summary || {});
  const stringCols = profile.columns.filter((c) => c.data_type === 'string');
  const otherCols = profile.columns.filter(
    (c) => c.data_type !== 'string' && !numericCols.includes(c.name)
  );

  const fileSizeKb = uploadedDataset?.size_bytes
    ? (uploadedDataset.size_bytes / 1024).toFixed(1)
    : null;

  return (
    <div className="tab-pane overview-tab">
      {/* Top Banner / Dataset Overview */}
      <div className="overview-header-card">
        <div className="overview-header-content">
          <div className="overview-badge">
            <Sparkles size={13} />
            <span>Dataset Active</span>
          </div>
          <h2 className="overview-dataset-title">{profile.filename}</h2>
          <p className="overview-dataset-desc">
            Profiled {profile.row_count.toLocaleString()} observations across {profile.column_count} distinct feature columns. All schemas inferred successfully.
          </p>
        </div>

        <div className="overview-header-actions">
          <button
            className="btn btn-primary btn-with-icon"
            onClick={() => onNavigateTab('ai-analyst')}
          >
            <Bot size={16} />
            <span>Ask AI Analyst</span>
          </button>
          <button
            className="btn btn-secondary btn-with-icon"
            onClick={() => onNavigateTab('analysis')}
          >
            <Calculator size={16} />
            <span>Run Analytics</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="metric-cards-grid">
        <MetricCard
          title="Total Observations"
          value={profile.row_count.toLocaleString()}
          subtitle="Data rows processed"
          icon={Rows3}
          badgeText="Rows"
          badgeType="indigo"
        />

        <MetricCard
          title="Feature Columns"
          value={profile.column_count}
          subtitle={`${numericCols.length} numeric, ${stringCols.length} categorical`}
          icon={Columns3}
          badgeText="Columns"
          badgeType="neutral"
        />

        <MetricCard
          title="Data Quality Score"
          value={`${quality.score}/100`}
          subtitle={`Grade ${quality.grade} • ${quality.completenessPercentage.toFixed(1)}% complete`}
          icon={ShieldCheck}
          badgeText={quality.status === 'optimal' ? 'Optimal' : 'Needs Review'}
          badgeType={quality.status === 'optimal' ? 'positive' : 'warning'}
        />

        <MetricCard
          title="Missing Cells"
          value={quality.missingCells.toLocaleString()}
          subtitle={
            quality.missingCells === 0
              ? 'Zero null values found'
              : `Across ${quality.columnsWithNulls} column(s)`
          }
          icon={AlertTriangle}
          badgeText={quality.missingCells === 0 ? 'Pristine' : 'Incomplete'}
          badgeType={quality.missingCells === 0 ? 'positive' : 'warning'}
        />

        {fileSizeKb && (
          <MetricCard
            title="Storage Footprint"
            value={`${fileSizeKb} KB`}
            subtitle="Raw CSV file size"
            icon={HardDrive}
            badgeText="Disk"
            badgeType="neutral"
          />
        )}
      </div>

      {/* Column Composition & Statistical Snapshot */}
      <div className="overview-sections-grid">
        <div className="overview-card">
          <h3 className="card-heading">
            <Columns3 size={17} className="heading-icon" />
            Feature Composition
          </h3>
          <p className="card-subheading">
            Breakdown of data types detected by the profiling engine
          </p>

          <div className="type-distribution-list">
            <div className="type-item">
              <div className="type-item-info">
                <span className="type-dot dot-indigo" />
                <span className="type-label">Numeric (Integer & Float)</span>
              </div>
              <div className="type-item-stats">
                <span className="type-count">{numericCols.length} cols</span>
                <span className="type-percentage">
                  {Math.round((numericCols.length / profile.column_count) * 100)}%
                </span>
              </div>
            </div>

            <div className="type-item">
              <div className="type-item-info">
                <span className="type-dot dot-teal" />
                <span className="type-label">Categorical / String</span>
              </div>
              <div className="type-item-stats">
                <span className="type-count">{stringCols.length} cols</span>
                <span className="type-percentage">
                  {Math.round((stringCols.length / profile.column_count) * 100)}%
                </span>
              </div>
            </div>

            {otherCols.length > 0 && (
              <div className="type-item">
                <div className="type-item-info">
                  <span className="type-dot dot-amber" />
                  <span className="type-label">Temporal / Boolean / Other</span>
                </div>
                <div className="type-item-stats">
                  <span className="type-count">{otherCols.length} cols</span>
                  <span className="type-percentage">
                    {Math.round((otherCols.length / profile.column_count) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="card-footer-action">
            <button
              className="btn btn-ghost btn-sm btn-with-icon"
              onClick={() => onNavigateTab('explorer')}
            >
              <span>Explore full schema table</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="overview-card">
          <h3 className="card-heading">
            <TrendingUp size={17} className="heading-icon" />
            Statistical Highlights
          </h3>
          <p className="card-subheading">
            Key indicators for primary numerical metrics
          </p>

          {numericCols.length > 0 ? (
            <div className="stats-highlight-list">
              {numericCols.slice(0, 3).map((colName) => {
                const s = profile.numeric_summary[colName];
                return (
                  <div key={colName} className="stats-highlight-row">
                    <div className="stats-highlight-name">
                      <code>{colName}</code>
                    </div>
                    <div className="stats-highlight-metrics">
                      <div className="stat-pill">
                        <span className="stat-pill-label">Mean</span>
                        <span className="stat-pill-val">{s.mean?.toFixed(1) ?? 'N/A'}</span>
                      </div>
                      <div className="stat-pill">
                        <span className="stat-pill-label">Range</span>
                        <span className="stat-pill-val">
                          {s.min} – {s.max}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-subtext">No numeric columns detected in this dataset.</p>
          )}

          <div className="card-footer-action">
            <button
              className="btn btn-ghost btn-sm btn-with-icon"
              onClick={() => onNavigateTab('charts')}
            >
              <span>Visualize distributions</span>
              <BarChart3 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

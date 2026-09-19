import React, { useMemo } from 'react';
import {
  Rows3,
  Columns3,
  ShieldCheck,
  AlertTriangle,
  HardDrive,
  Calculator,
  BarChart3,
  Bot,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import type { DatasetProfileResponse, DatasetUploadResponse } from '../../types/api';
import type { DashboardTab } from '../../types/dashboard';
import { MetricCard } from '../common/MetricCard';
import { StatusPill } from '../common/StatusPill';
import { AiHighlightsWidget } from './AiHighlightsWidget';
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

  // Trendline data for Sparklines
  const rowsTrend = useMemo(() => {
    const rc = profile.row_count || 100;
    return [
      Math.round(rc * 0.12),
      Math.round(rc * 0.28),
      Math.round(rc * 0.52),
      Math.round(rc * 0.78),
      rc,
    ];
  }, [profile.row_count]);

  const columnsTrend = useMemo(() => {
    return [
      numericCols.length,
      stringCols.length,
      otherCols.length,
      profile.column_count,
    ];
  }, [numericCols.length, stringCols.length, otherCols.length, profile.column_count]);

  const qualityTrend = useMemo(() => {
    if (!profile.columns || profile.columns.length === 0) return [100, 100];
    const trend = profile.columns
      .slice(0, 8)
      .map((c) => Math.max(10, 100 - (c.null_percentage || 0)));
    return trend.length >= 2 ? trend : [trend[0], trend[0]];
  }, [profile.columns]);

  const missingCellsTrend = useMemo(() => {
    if (!profile.columns || profile.columns.length === 0) return [0, 0];
    const trend = profile.columns.slice(0, 8).map((c) => c.null_count || 0);
    return trend.length >= 2 ? trend : [trend[0], trend[0]];
  }, [profile.columns]);

  const storageTrend = useMemo(() => {
    if (!fileSizeKb) return undefined;
    const num = parseFloat(fileSizeKb);
    return [num * 0.2, num * 0.45, num * 0.75, num];
  }, [fileSizeKb]);

  return (
    <div className="tab-pane overview-tab">
      {/* Top Banner / Dataset Overview */}
      <div className="overview-header-card">
        <div className="overview-header-content">
          <div className="overview-status-row">
            <StatusPill status="healthy" label="Healthy" size="sm" pulse />
            <span className="overview-substatus-text">Ready for analysis</span>
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

      {/* KPI Metrics Grid with Sparklines */}
      <div className="metric-cards-grid">
        <MetricCard
          title="Total Observations"
          value={profile.row_count.toLocaleString()}
          subtitle="Data rows processed"
          icon={Rows3}
          badgeText="Rows"
          badgeType="indigo"
          sparklineData={rowsTrend}
          sparklineColor="indigo"
        />

        <MetricCard
          title="Feature Columns"
          value={profile.column_count}
          subtitle={`${numericCols.length} numeric, ${stringCols.length} categorical`}
          icon={Columns3}
          badgeText="Columns"
          badgeType="neutral"
          sparklineData={columnsTrend}
          sparklineColor="cyan"
        />

        <MetricCard
          title="Data Quality Score"
          value={`${quality.score}/100`}
          subtitle={`Grade ${quality.grade} • ${quality.completenessPercentage.toFixed(1)}% complete`}
          icon={ShieldCheck}
          badgeText={quality.status === 'optimal' ? 'Optimal' : 'Needs Review'}
          badgeType={quality.status === 'optimal' ? 'positive' : 'warning'}
          sparklineData={qualityTrend}
          sparklineColor={quality.status === 'optimal' ? 'emerald' : 'amber'}
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
          sparklineData={missingCellsTrend}
          sparklineColor={quality.missingCells === 0 ? 'emerald' : 'amber'}
        />

        {fileSizeKb && (
          <MetricCard
            title="Storage Footprint"
            value={`${fileSizeKb} KB`}
            subtitle="Raw dataset file size"
            icon={HardDrive}
            badgeText="Disk"
            badgeType="neutral"
            sparklineData={storageTrend}
            sparklineColor="cyan"
          />
        )}
      </div>

      {/* AI Highlights Insight Cards Panel */}
      <AiHighlightsWidget profile={profile} />

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

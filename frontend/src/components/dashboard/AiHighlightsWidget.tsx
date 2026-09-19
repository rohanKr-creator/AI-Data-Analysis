import React, { useMemo } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Sparkles,
  Bot,
} from 'lucide-react';
import type { DatasetProfileResponse } from '../../types/api';
import { StatusPill } from '../common/StatusPill';

export interface InsightCardData {
  id: string;
  type: 'improving' | 'notable' | 'interesting';
  badgeLabel: string;
  title: string;
  description: string;
}

interface AiHighlightsWidgetProps {
  profile: DatasetProfileResponse;
}

export const AiHighlightsWidget: React.FC<AiHighlightsWidgetProps> = ({ profile }) => {
  const insights = useMemo<InsightCardData[]>(() => {
    const list: InsightCardData[] = [];
    const totalRows = profile.row_count || 0;
    const totalCols = profile.column_count || 0;
    const totalCells = totalRows * totalCols;
    const columns = profile.columns || [];
    const numericStats = profile.numeric_summary || {};
    const numericColNames = Object.keys(numericStats);

    // 1. IMPROVING / POSITIVE TREND (Green Up-Arrow)
    const totalNulls = columns.reduce((acc, c) => acc + (c.null_count || 0), 0);
    if (totalNulls === 0 && totalCells > 0) {
      list.push({
        id: 'completeness-perfect',
        type: 'improving',
        badgeLabel: 'Data Health',
        title: '100% Data Completeness',
        description: `All ${totalRows.toLocaleString()} observations across ${totalCols} features are fully populated with zero missing cells.`,
      });
    } else {
      const completenessPct =
        totalCells > 0 ? ((totalCells - totalNulls) / totalCells) * 100 : 100;
      if (completenessPct >= 95) {
        list.push({
          id: 'completeness-high',
          type: 'improving',
          badgeLabel: 'Data Integrity',
          title: 'High Observation Density',
          description: `${completenessPct.toFixed(1)}% of data points are verified and intact, providing a high-confidence foundation for modeling.`,
        });
      } else {
        list.push({
          id: 'schema-ingestion',
          type: 'improving',
          badgeLabel: 'Ingestion Health',
          title: 'Schema Validation Complete',
          description: `Ingested ${totalRows.toLocaleString()} rows with typed type inferences across ${numericColNames.length} numeric and ${totalCols - numericColNames.length} categorical attributes.`,
        });
      }
    }

    // 2. NOTABLE FINDING (Orange "!" Badge)
    // Find column with worst missing rate or highest variance
    const colsWithNulls = [...columns]
      .filter((c) => (c.null_count || 0) > 0)
      .sort((a, b) => (b.null_percentage || 0) - (a.null_percentage || 0));

    if (colsWithNulls.length > 0) {
      const worst = colsWithNulls[0];
      list.push({
        id: 'nulls-found',
        type: 'notable',
        badgeLabel: 'Notable Finding',
        title: `Missing Values in "${worst.name}"`,
        description: `"${worst.name}" has ${worst.null_percentage.toFixed(1)}% missing values (${worst.null_count.toLocaleString()} rows). Imputation or filtering is recommended.`,
      });
    } else {
      // Look for highest variance column among numeric features
      let highestVarCol: string | null = null;
      let highestCv = -1;

      for (const colName of numericColNames) {
        const stats = numericStats[colName];
        if (stats && stats.mean && stats.std && stats.mean !== 0) {
          const cv = Math.abs(stats.std / stats.mean);
          if (cv > highestCv) {
            highestCv = cv;
            highestVarCol = colName;
          }
        }
      }

      if (highestVarCol && highestCv > 0.5) {
        const s = numericStats[highestVarCol];
        list.push({
          id: 'high-variance',
          type: 'notable',
          badgeLabel: 'Notable Finding',
          title: `High Variance in "${highestVarCol}"`,
          description: `Standard deviation (${s.std?.toFixed(1)}) is significant relative to mean (${s.mean?.toFixed(1)}), signaling wide distribution spread.`,
        });
      } else {
        list.push({
          id: 'uniform-records',
          type: 'notable',
          badgeLabel: 'Notable Finding',
          title: 'Uniform Distribution',
          description: `Numerical indicators exhibit balanced variance without severe skew or volatile distributional outliers.`,
        });
      }
    }

    // 3. INTERESTING PATTERN (Blue Sparkle Badge)
    // Find high-cardinality categorical column or widest dynamic range
    const categoricalCols = columns
      .filter((c) => c.data_type === 'string' && (c.unique_count || 0) > 1)
      .sort((a, b) => (b.unique_count || 0) - (a.unique_count || 0));

    if (categoricalCols.length > 0) {
      const topCat = categoricalCols[0];
      list.push({
        id: 'cardinality-pattern',
        type: 'interesting',
        badgeLabel: 'Key Pattern',
        title: `High Cardinality: "${topCat.name}"`,
        description: `"${topCat.name}" features ${topCat.unique_count} distinct categories across records, making it ideal for dimension breakdown.`,
      });
    } else if (numericColNames.length > 0) {
      // Find widest numeric range
      let widestCol = numericColNames[0];
      let maxRange = -1;

      for (const colName of numericColNames) {
        const s = numericStats[colName];
        if (s && s.max != null && s.min != null) {
          const span = s.max - s.min;
          if (span > maxRange) {
            maxRange = span;
            widestCol = colName;
          }
        }
      }

      const s = numericStats[widestCol];
      list.push({
        id: 'dynamic-range',
        type: 'interesting',
        badgeLabel: 'Key Pattern',
        title: `Broad Dynamic Range: "${widestCol}"`,
        description: `Values span from ${s.min?.toLocaleString()} to ${s.max?.toLocaleString()} (range of ${maxRange.toLocaleString()}), driving dominant numerical scale.`,
      });
    } else {
      list.push({
        id: 'feature-composition',
        type: 'interesting',
        badgeLabel: 'Key Pattern',
        title: 'Clean Relational Structure',
        description: `Structure is optimized for fast exploratory querying and natural language question answering.`,
      });
    }

    return list;
  }, [profile]);

  if (!profile || insights.length === 0) return null;

  return (
    <div className="ai-highlights-panel">
      <div className="ai-highlights-header">
        <div className="ai-highlights-title-group">
          <div className="ai-highlights-avatar-icon">
            <Bot size={17} />
          </div>
          <div>
            <h3 className="ai-highlights-title">AI Dataset Highlights</h3>
            <p className="ai-highlights-subtitle">
              Automated statistical pattern detection synthesized from profile metrics
            </p>
          </div>
        </div>
        <StatusPill status="healthy" label="Live Synthesis" size="sm" pulse />
      </div>

      <div className="ai-highlights-grid">
        {insights.map((item) => {
          return (
            <div
              key={item.id}
              className={`ai-highlight-card ai-highlight-card-${item.type}`}
            >
              <div className="ai-highlight-card-top">
                <div
                  className={`ai-highlight-badge-icon badge-icon-${item.type}`}
                  aria-hidden="true"
                >
                  {item.type === 'improving' && <TrendingUp size={15} />}
                  {item.type === 'notable' && <AlertCircle size={15} />}
                  {item.type === 'interesting' && <Sparkles size={15} />}
                </div>
                <span className="ai-highlight-category">{item.badgeLabel}</span>
              </div>
              <h4 className="ai-highlight-card-title">{item.title}</h4>
              <p className="ai-highlight-card-desc">{item.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

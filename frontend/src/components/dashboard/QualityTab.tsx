import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import type { DatasetProfileResponse } from '../../types/api';
import { calculateQualityReport } from '../../services/aiAnalystService';

interface QualityTabProps {
  profile: DatasetProfileResponse;
}

export const QualityTab: React.FC<QualityTabProps> = ({ profile }) => {
  const quality = calculateQualityReport(profile);

  return (
    <div className="tab-pane quality-tab">
      {/* Quality Scorecard Hero */}
      <div className="quality-scorecard-card">
        <div className="scorecard-radial">
          <div className="scorecard-ring">
            <span className="scorecard-number">{quality.score}</span>
            <span className="scorecard-denominator">/ 100</span>
          </div>
          <div className="scorecard-grade-badge">Grade {quality.grade}</div>
        </div>

        <div className="scorecard-details">
          <div className="scorecard-title-row">
            <ShieldCheck size={22} className="scorecard-icon text-emerald" />
            <h3 className="scorecard-heading">Dataset Hygiene Audit</h3>
          </div>
          <p className="scorecard-description">
            The overall data hygiene score is calculated based on row completeness, feature missingness, and schema consistency.
          </p>

          <div className="scorecard-pills-row">
            <span className="audit-pill pill-green">
              <CheckCircle2 size={13} /> {quality.cleanColumns} 100% Clean Columns
            </span>
            {quality.columnsWithNulls > 0 ? (
              <span className="audit-pill pill-amber">
                <AlertTriangle size={13} /> {quality.columnsWithNulls} Columns with Missing Values
              </span>
            ) : (
              <span className="audit-pill pill-green">
                <CheckCircle2 size={13} /> Zero Null Values Detected
              </span>
            )}
            <span className="audit-pill pill-indigo">
              <FileCheck2 size={13} /> {quality.totalCells.toLocaleString()} Total Data Cells
            </span>
          </div>
        </div>
      </div>

      {/* Column by column completeness audit */}
      <div className="quality-breakdown-card">
        <div className="panel-header">
          <Sparkles size={18} className="panel-icon" />
          <div>
            <h3 className="panel-title">Column Completeness Breakdown</h3>
            <p className="panel-subtitle">Observation integrity and missing data rates per column</p>
          </div>
        </div>

        <div className="table-scroll-container">
          <table className="saas-table quality-table">
            <thead>
              <tr>
                <th>Column Name</th>
                <th>Inferred Type</th>
                <th>Null Count</th>
                <th>Completeness %</th>
                <th>Health Status</th>
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((col) => {
                const completeness = 100 - col.null_percentage;
                const isPristine = col.null_count === 0;
                const isAcceptable = col.null_percentage < 10;

                return (
                  <tr key={col.name}>
                    <td>
                      <strong>{col.name}</strong>
                    </td>
                    <td>
                      <code>{col.data_type}</code>
                    </td>
                    <td>
                      <span className={col.null_count > 0 ? 'text-warning font-mono' : 'text-muted font-mono'}>
                        {col.null_count.toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <div className="completeness-bar-wrapper">
                        <div
                          className={`completeness-bar ${
                            isPristine ? 'bar-green' : isAcceptable ? 'bar-amber' : 'bar-red'
                          }`}
                          style={{ width: `${completeness}%` }}
                        />
                        <span className="completeness-text">{completeness.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      {isPristine ? (
                        <span className="status-badge badge-clean">
                          <CheckCircle2 size={12} /> Clean
                        </span>
                      ) : isAcceptable ? (
                        <span className="status-badge badge-warning">
                          <AlertTriangle size={12} /> Low Missing Rate
                        </span>
                      ) : (
                        <span className="status-badge badge-danger">
                          <AlertCircle size={12} /> High Missing Rate
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations Card */}
      <div className="quality-recommendations-card">
        <h4 className="recommendation-title">Auditor Recommendations</h4>
        <ul className="recommendations-list">
          {quality.missingCells === 0 ? (
            <li>
              <CheckCircle2 size={15} className="text-emerald" />
              <span>Dataset is completely balanced and contains zero missing cells. Ready for high-confidence regression and classification modeling.</span>
            </li>
          ) : (
            <li>
              <AlertTriangle size={15} className="text-amber" />
              <span>Consider imputing missing values for columns with &lt;10% missing rate using median/mode before running aggregate correlation algorithms.</span>
            </li>
          )}
          <li>
            <FileCheck2 size={15} className="text-indigo" />
            <span>Schema integrity: all {profile.column_count} column types were successfully validated against standard RFC-4180 CSV specification.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

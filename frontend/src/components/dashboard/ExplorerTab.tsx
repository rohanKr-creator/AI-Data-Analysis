import React, { useState, useMemo } from 'react';
import {
  Table2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
  Type,
  Calendar,
  Binary,
  Layers,
} from 'lucide-react';
import type { DatasetProfileResponse } from '../../types/api';

interface ExplorerTabProps {
  profile: DatasetProfileResponse;
}

const getTypeIcon = (dataType: string) => {
  const t = dataType.toLowerCase();
  if (t.includes('int') || t.includes('float') || t.includes('num')) {
    return <Hash size={12} className="type-icon" />;
  }
  if (t.includes('bool')) {
    return <Binary size={12} className="type-icon" />;
  }
  if (t.includes('date') || t.includes('time')) {
    return <Calendar size={12} className="type-icon" />;
  }
  return <Type size={12} className="type-icon" />;
};

export const ExplorerTab: React.FC<ExplorerTabProps> = ({ profile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [activeSubView, setActiveSubView] = useState<'preview' | 'schema'>('preview');

  const headers = useMemo(() => {
    if (profile.preview && profile.preview.length > 0) {
      return Object.keys(profile.preview[0]);
    }
    return profile.columns.map((c) => c.name);
  }, [profile]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const filteredPreview = useMemo(() => {
    let rows = [...(profile.preview || [])];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) =>
          String(val ?? '').toLowerCase().includes(q)
        )
      );
    }

    if (sortColumn) {
      rows.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return rows;
  }, [profile.preview, searchTerm, sortColumn, sortDirection]);

  return (
    <div className="tab-pane explorer-tab">
      {/* Header controls */}
      <div className="explorer-toolbar">
        <div className="tab-toggle-group">
          <button
            className={`btn-toggle ${activeSubView === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveSubView('preview')}
          >
            <Table2 size={14} />
            <span>Data Preview ({profile.preview?.length || 0} rows)</span>
          </button>
          <button
            className={`btn-toggle ${activeSubView === 'schema' ? 'active' : ''}`}
            onClick={() => setActiveSubView('schema')}
          >
            <Layers size={14} />
            <span>Schema & Profiling ({profile.column_count} columns)</span>
          </button>
        </div>

        {activeSubView === 'preview' && (
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search values in preview..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {activeSubView === 'preview' ? (
        <div className="table-card">
          <div className="table-scroll-container">
            <table className="saas-table preview-table">
              <thead>
                <tr>
                  <th className="th-index">#</th>
                  {headers.map((colName) => {
                    const isSorted = sortColumn === colName;
                    return (
                      <th
                        key={colName}
                        onClick={() => handleSort(colName)}
                        className="th-sortable"
                      >
                        <div className="th-content">
                          <span>{colName}</span>
                          <span className="th-sort-icon">
                            {isSorted ? (
                              sortDirection === 'asc' ? (
                                <ArrowUp size={12} className="sort-active" />
                              ) : (
                                <ArrowDown size={12} className="sort-active" />
                              )
                            ) : (
                              <ArrowUpDown size={12} className="sort-idle" />
                            )}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredPreview.length > 0 ? (
                  filteredPreview.map((row, idx) => (
                    <tr key={idx}>
                      <td className="td-index">{idx + 1}</td>
                      {headers.map((header) => {
                        const val = row[header];
                        return (
                          <td key={header}>
                            {val === null || val === undefined ? (
                              <span className="null-indicator">null</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={headers.length + 1} className="td-empty">
                      No matching rows found for "{searchTerm}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              Showing {filteredPreview.length} of {profile.preview?.length || 0} preview rows
            </span>
            <span className="table-note">
              First 5 sample rows extracted from {profile.row_count.toLocaleString()} total rows
            </span>
          </div>
        </div>
      ) : (
        /* Schema Table */
        <div className="table-card">
          <div className="table-scroll-container">
            <table className="saas-table schema-table">
              <thead>
                <tr>
                  <th>Column Name</th>
                  <th>Inferred Type</th>
                  <th>Null Values</th>
                  <th>Completeness</th>
                  <th>Mean</th>
                  <th>Std Dev</th>
                  <th>Observed Range</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((col) => {
                  const numStat = profile.numeric_summary?.[col.name];
                  const completeness = 100 - col.null_percentage;
                  return (
                    <tr key={col.name}>
                      <td>
                        <strong>{col.name}</strong>
                      </td>
                      <td>
                        <span className="type-badge">
                          {getTypeIcon(col.data_type)}
                          <span>{col.data_type}</span>
                        </span>
                      </td>
                      <td>
                        <span
                          className={col.null_count > 0 ? 'text-warning' : 'text-muted'}
                        >
                          {col.null_count} ({col.null_percentage.toFixed(1)}%)
                        </span>
                      </td>
                      <td>
                        <div className="completeness-bar-wrapper">
                          <div
                            className={`completeness-bar ${
                              completeness >= 95 ? 'bar-green' : completeness >= 80 ? 'bar-amber' : 'bar-red'
                            }`}
                            style={{ width: `${completeness}%` }}
                          />
                          <span className="completeness-text">{completeness.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td>{numStat?.mean !== null && numStat?.mean !== undefined ? numStat.mean.toFixed(2) : '-'}</td>
                      <td>{numStat?.std !== null && numStat?.std !== undefined ? numStat.std.toFixed(2) : '-'}</td>
                      <td>
                        {numStat?.min !== null && numStat?.min !== undefined && numStat?.max !== null && numStat?.max !== undefined ? (
                          <span className="range-badge">
                            {numStat.min} → {numStat.max}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

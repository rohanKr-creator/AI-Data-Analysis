import React from 'react';
import {
  LayoutDashboard,
  Table2,
  Calculator,
  BarChart3,
  Bot,
  ShieldCheck,
  UploadCloud,
  FileCode2,
} from 'lucide-react';
import type { DashboardTab } from '../../types/dashboard';
import type { DatasetProfileResponse } from '../../types/api';

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  profile: DatasetProfileResponse | null;
  qualityScore?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNewUpload: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  profile,
  qualityScore,
  mobileOpen,
  onCloseMobile,
  onNewUpload,
}) => {
  const navItems: {
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: string | number;
    badgeColor?: string;
  }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'explorer',
      label: 'Dataset Explorer',
      icon: Table2,
      badge: profile ? `${profile.column_count} cols` : undefined,
    },
    {
      id: 'analysis',
      label: 'Analysis Workbench',
      icon: Calculator,
    },
    {
      id: 'charts',
      label: 'Visualizations',
      icon: BarChart3,
      badge: 'Charts',
      badgeColor: 'indigo',
    },
    {
      id: 'ai-analyst',
      label: 'AI Analyst',
      icon: Bot,
      badge: 'Assistant',
      badgeColor: 'purple',
    },
    {
      id: 'quality',
      label: 'Data Quality',
      icon: ShieldCheck,
      badge: qualityScore !== undefined ? `${qualityScore}%` : undefined,
      badgeColor: qualityScore && qualityScore >= 90 ? 'emerald' : 'amber',
    },
  ];

  const handleSelect = (tab: DashboardTab) => {
    onTabChange(tab);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside className={`saas-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-section-label">ANALYTICS SUITE</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => handleSelect(item.id)}
              >
                <div className="sidebar-link-inner">
                  <Icon size={18} className="sidebar-icon" />
                  <span className="sidebar-label">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`sidebar-badge ${
                      item.badgeColor ? `badge-${item.badgeColor}` : ''
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-upload-btn" onClick={onNewUpload}>
            <UploadCloud size={16} />
            <span>Upload New CSV</span>
          </button>
          <div className="sidebar-meta">
            <FileCode2 size={13} />
            <span>FastAPI • Pandas • Recharts</span>
          </div>
        </div>
      </aside>
    </>
  );
};

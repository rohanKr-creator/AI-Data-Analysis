import React, { useState } from 'react';
import {
  LayoutDashboard,
  Table2,
  Calculator,
  BarChart3,
  Bot,
  ShieldCheck,
  UploadCloud,
  FileCode2,
  Sparkles,
  Zap,
  Search,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { DashboardTab } from '../../types/dashboard';
import type { DatasetProfileResponse, UserUsageResponse } from '../../types/api';

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  profile: DatasetProfileResponse | null;
  qualityScore?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNewUpload: () => void;
  userUsage?: UserUsageResponse | null;
  onOpenUpgrade?: () => void;
  currentUser?: User | null;
  onOpenAuth?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  profile,
  qualityScore,
  mobileOpen,
  onCloseMobile,
  onNewUpload,
  userUsage,
  onOpenUpgrade,
  currentUser,
  onOpenAuth,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  const filteredNavItems = searchQuery.trim()
    ? navItems.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : navItems;

  const handleSelect = (tab: DashboardTab) => {
    onTabChange(tab);
    onCloseMobile();
  };

  const userDisplayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    'User';

  const userEmail = currentUser?.email || 'user@example.com';
  const userInitials = (userDisplayName?.[0] || userEmail?.[0] || 'U').toUpperCase();

  const isPro = userUsage?.tier === 'pro';

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={`saas-sidebar ${isCollapsed ? 'collapsed' : ''} ${
          mobileOpen ? 'mobile-open' : ''
        }`}
      >
        {/* Top Header Row with Collapse/Expand Toggle */}
        <div className="sidebar-top-section">
          <div className="sidebar-header-row">
            {!isCollapsed && (
              <div className="sidebar-section-label">ANALYTICS SUITE</div>
            )}
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setIsCollapsed((prev) => !prev)}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          {/* Search/Filter Bar */}
          {!isCollapsed ? (
            <div className="sidebar-search-box">
              <Search size={14} className="sidebar-search-icon" />
              <input
                type="text"
                className="sidebar-search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter navigation"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="sidebar-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="sidebar-collapsed-search-btn"
              onClick={() => setIsCollapsed(false)}
              title="Search navigation items"
              aria-label="Search navigation items"
            >
              <Search size={16} />
            </button>
          )}
        </div>

        {/* Navigation Group with Divider Pattern */}
        <div className="sidebar-nav-container">
          <div className="sidebar-group-header">
            <div className="sidebar-group-divider" />
            {!isCollapsed && <span className="sidebar-group-title">WORKSPACE</span>}
          </div>

          <nav className="sidebar-nav">
            {filteredNavItems.length === 0 ? (
              <div className="sidebar-no-results">No matching tabs</div>
            ) : (
              filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelect(item.id)}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className="sidebar-link-inner">
                      <Icon size={18} className="sidebar-icon" />
                      {!isCollapsed && (
                        <span className="sidebar-label">{item.label}</span>
                      )}
                    </div>
                    {!isCollapsed && item.badge && (
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
              })
            )}
          </nav>
        </div>

        {/* Bottom Section: Pro Plan Card + Upload + Profile Footer */}
        <div className="sidebar-bottom-section">
          {/* Boost with AI / Pro Plan Gradient Card */}
          {userUsage && !isCollapsed && (
            <div className={`sidebar-pro-card ${isPro ? 'card-pro' : 'card-free'}`}>
              <div className="pro-card-header">
                <div className="pro-card-badge">
                  {isPro ? (
                    <span className="pill-pro">
                      <Zap size={12} /> PRO PLAN
                    </span>
                  ) : (
                    <span className="pill-boost">
                      <Sparkles size={12} /> BOOST WITH AI
                    </span>
                  )}
                </div>
              </div>

              <div className="pro-card-content">
                <h4 className="pro-card-title">
                  {isPro ? 'Pro Active' : 'Upgrade to Pro'}
                </h4>
                <p className="pro-card-desc">
                  {isPro
                    ? 'Unlimited questions & deep statistical profiling.'
                    : 'Unlock unlimited AI questions & instant deep CSV analysis.'}
                </p>

                {/* Progress bar for free tier */}
                {!userUsage.usage.ask.unlimited && (
                  <div className="pro-card-metric">
                    <div className="metric-row">
                      <span className="metric-label">AI Questions</span>
                      <span className="metric-val">
                        {userUsage.usage.ask.used} / {userUsage.usage.ask.limit}
                      </span>
                    </div>
                    <div className="pro-progress-track">
                      <div
                        className={`pro-progress-bar ${
                          userUsage.usage.ask.used >= (userUsage.usage.ask.limit ?? 20)
                            ? 'bar-danger'
                            : ''
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (userUsage.usage.ask.used / (userUsage.usage.ask.limit || 20)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {!isPro && onOpenUpgrade && (
                <button
                  type="button"
                  className="pro-card-cta-btn"
                  onClick={onOpenUpgrade}
                >
                  <Zap size={13} />
                  <span>Upgrade to Pro</span>
                </button>
              )}
              {isPro && (
                <div className="pro-card-unlimited-tag">
                  <CheckCircle2 size={13} />
                  <span>Unlimited Queries & Uploads</span>
                </div>
              )}
            </div>
          )}

          {/* Mini Pro indicator when collapsed */}
          {userUsage && isCollapsed && (
            <div
              className="sidebar-collapsed-pro-indicator"
              onClick={!isPro ? onOpenUpgrade : undefined}
              title={
                isPro
                  ? 'Pro Plan: Unlimited questions active'
                  : `Free Plan: ${userUsage.usage.ask.used}/${userUsage.usage.ask.limit} Qs (Click to Upgrade)`
              }
              role="button"
              tabIndex={0}
            >
              {isPro ? <Zap size={16} className="collapsed-zap-pro" /> : <Sparkles size={16} className="collapsed-sparkles" />}
            </div>
          )}

          {/* Upload New Dataset Action */}
          <button
            className="sidebar-upload-btn"
            onClick={onNewUpload}
            title={isCollapsed ? 'Upload New Dataset' : undefined}
          >
            <UploadCloud size={16} className="sidebar-upload-icon" />
            {!isCollapsed && <span>Upload New Dataset</span>}
          </button>

          {/* User Profile Footer Row */}
          <div
            className="sidebar-user-footer"
            onClick={onOpenAuth}
            role="button"
            tabIndex={0}
            title={currentUser ? `Account: ${userEmail} (Click to inspect profile)` : 'Account'}
          >
            <div className="user-avatar-circle">
              {userInitials}
            </div>
            {!isCollapsed && (
              <>
                <div className="user-profile-meta">
                  <span className="user-display-name">{userDisplayName}</span>
                  <span className="user-email-text">{userEmail}</span>
                </div>
                <div className="user-profile-action">
                  <ChevronRight size={14} className="user-chevron-icon" />
                </div>
              </>
            )}
          </div>

          {!isCollapsed && (
            <div className="sidebar-meta">
              <FileCode2 size={12} />
              <span>FastAPI • Pandas • Recharts</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

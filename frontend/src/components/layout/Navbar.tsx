import React from 'react';
import {
  Sparkles,
  FileSpreadsheet,
  PlusCircle,
  Menu,
  X,
  PlayCircle,
  LogIn,
  LogOut,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { DatasetProfileResponse } from '../../types/api';

interface NavbarProps {
  profile: DatasetProfileResponse | null;
  onNewUpload: () => void;
  onLoadDemo: () => void;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  profile,
  onNewUpload,
  onLoadDemo,
  mobileMenuOpen,
  onToggleMobileMenu,
  currentUser,
  onOpenAuth,
  onSignOut,
}) => {
  return (
    <header className="saas-navbar">
      <div className="navbar-left">
        <button
          className="mobile-nav-toggle"
          onClick={onToggleMobileMenu}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="brand-lockup" onClick={onNewUpload} role="button" tabIndex={0}>
          <div className="brand-icon-wrapper">
            <Sparkles size={18} className="brand-sparkle" />
          </div>
          <div className="brand-text">
            <span className="brand-title">AI Data Analyst</span>
            <span className="brand-edition">Enterprise SaaS</span>
          </div>
        </div>

        {profile && (
          <div className="active-dataset-pill">
            <span className="pulse-indicator" />
            <FileSpreadsheet size={14} className="dataset-pill-icon" />
            <span className="dataset-pill-name">{profile.filename}</span>
            <span className="dataset-pill-stats">
              {profile.row_count.toLocaleString()} rows
            </span>
          </div>
        )}
      </div>

      <div className="navbar-right">
        {!profile && (
          <button
            className="btn btn-secondary btn-sm btn-with-icon"
            onClick={onLoadDemo}
            title="Instantly test with pre-built demo sales CSV"
          >
            <PlayCircle size={14} />
            <span>Load Demo CSV</span>
          </button>
        )}

        {profile && (
          <button
            className="btn btn-secondary btn-sm btn-with-icon"
            onClick={onNewUpload}
          >
            <PlusCircle size={14} />
            <span>Upload New</span>
          </button>
        )}

        {currentUser ? (
          <div className="navbar-auth-group">
            <div
              className="user-profile-badge authenticated"
              onClick={onOpenAuth}
              role="button"
              tabIndex={0}
              title={`Logged in as ${currentUser.email} (Click to inspect user details)`}
            >
              <div className="user-avatar">
                {(currentUser.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="user-info-text">
                <span className="user-email-display">{currentUser.email}</span>
                <span className="user-role-badge">Authenticated</span>
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm btn-with-icon navbar-logout-btn"
              onClick={onSignOut}
              title="Sign Out"
              aria-label="Log Out"
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm btn-with-icon navbar-signin-btn"
            onClick={onOpenAuth}
            title="Sign in or Sign up with Supabase Auth"
          >
            <LogIn size={14} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};


import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowLeft,
  Sparkles,
  Zap,
  BarChart2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  Shield,
  Activity,
  Fingerprint,
  Calendar,
  Crown,
  Copy,
  ArrowRight,
  LogOut,
  Terminal,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { getAuthMe, getUserUsage } from '../../services/api';
import type { UserProfileResponse, UserUsageResponse } from '../../types/api';
import { StatusPill } from '../common/StatusPill';
import { InteractiveMiniComputer } from './InteractiveMiniComputer';

export type AuthMode = 'login' | 'signup' | 'forgot-password';

interface AuthPageProps {
  initialMode?: 'login' | 'signup';
  currentUser: User | null;
  userUsage?: UserUsageResponse | null;
  onAuthSuccess: (email: string, mode: 'login' | 'signup') => void;
  onBack: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'login',
  currentUser,
  userUsage,
  onAuthSuccess,
  onBack,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resolved user tier state (PRO or FREE)
  const [resolvedTier, setResolvedTier] = useState<string>(userUsage?.tier || 'free');
  const [copiedId, setCopiedId] = useState(false);

  // Developer/Admin account check (used for UI diagnostics visibility)
  // Note: Client-side filter to declutter regular user experience; backend JWT validation enforces real security
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdmin = Boolean(
    adminEmail && currentUser?.email && currentUser.email.trim().toLowerCase() === adminEmail
  );

  const userDisplayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    'User';

  useEffect(() => {
    if (userUsage?.tier) {
      setResolvedTier(userUsage.tier);
    } else if (currentUser) {
      getUserUsage()
        .then((data) => {
          if (data?.tier) setResolvedTier(data.tier);
        })
        .catch(() => {
          // Graceful fallback to free tier if unconfigured/offline
        });
    }
  }, [currentUser, userUsage]);

  const handleCopyId = () => {
    if (currentUser?.id) {
      navigator.clipboard.writeText(currentUser.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const memberSinceFormatted = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recent Member';

  // Reassuring inline validation states
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);

  // Backend handshake test state (for authenticated user review)
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendResult, setBackendResult] = useState<UserProfileResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  const resetFeedback = () => {
    setApiError(null);
    setApiSuccess(null);
    setEmailError(null);
    setBackendResult(null);
    setBackendError(null);
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    setMode(newMode);
    resetFeedback();
    setEmailTouched(false);
    setPasswordTouched(false);
  };

  // Reassuring inline email validation
  const validateEmail = (val: string): boolean => {
    if (!val.trim()) {
      setEmailError('Email address is required.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val.trim())) {
      setEmailError('Please enter a valid email address (e.g. name@company.com).');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (emailTouched) {
      validateEmail(val);
    }
    if (apiError) setApiError(null);
  };

  const handleEmailBlur = () => {
    setEmailTouched(true);
    validateEmail(email);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (apiError) setApiError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const isEmailValid = validateEmail(email);
    if (!isEmailValid) {
      return;
    }

    if (mode !== 'forgot-password' && !password.trim()) {
      setApiError('Please enter your password.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setApiError('Password must be at least 6 characters.');
      return;
    }

    if (!isSupabaseConfigured) {
      setApiError(
        'Supabase Anon Key is not configured. Please add VITE_SUPABASE_ANON_KEY to your frontend/.env file.'
      );
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if ((error.message || '').toLowerCase().includes('invalid login credentials')) {
            setApiError('Incorrect email or password. Please check your credentials.');
          } else {
            setApiError(error.message);
          }
          return;
        }

        if (data.user) {
          onAuthSuccess(data.user.email || email, 'login');
          setApiSuccess('Welcome back! Redirecting to your workspace...');
          setTimeout(() => {
            onBack();
          }, 800);
        }
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setApiError(error.message);
          return;
        }

        if (data.session) {
          // Auto-confirmed user
          onAuthSuccess(data.user?.email || email, 'signup');
          setApiSuccess('Account created! Entering your workspace...');
          setTimeout(() => {
            onBack();
          }, 1000);
        } else if (data.user) {
          // Confirmation email sent
          setApiSuccess(
            'Account created! A confirmation link has been sent to your inbox. Please verify your email to log in.'
          );
        }
      } else if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });

        if (error) {
          setApiError(error.message);
        } else {
          setApiSuccess('Password reset link sent! Check your inbox for instructions.');
        }
      }
    } catch (err) {
      setApiError((err as Error).message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestBackendMe = async () => {
    setTestingBackend(true);
    setBackendResult(null);
    setBackendError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setBackendError('No active session token found. Please log in first.');
        return;
      }

      const profile = await getAuthMe(token);
      setBackendResult(profile);
    } catch (err) {
      setBackendError((err as Error).message);
    } finally {
      setTestingBackend(false);
    }
  };

  return (
    <div className="auth-page-root">
      {/* 50/50 Split Screen Layout */}
      <div className="auth-split-layout">
        {/* =========================================================================
            LEFT PANEL: Conversion & Frictionless Form
            ========================================================================= */}
        <section className="auth-panel-conversion" aria-label="Authentication Form">
          {/* Top navigation row */}
          <div className="auth-conversion-top">
            <button
              type="button"
              className="auth-back-button"
              onClick={onBack}
              aria-label="Back to data workspace"
            >
              <ArrowLeft size={16} />
              <span>Back to platform</span>
            </button>

            <div className="auth-brand-badge" onClick={onBack} role="button" tabIndex={0}>
              <div className="auth-brand-icon">
                <Sparkles size={16} />
              </div>
              <span className="auth-brand-name">AI Data Analyst</span>
            </div>
          </div>

          <div className="auth-conversion-content">
            {currentUser ? (
              /* Already Authenticated Account View with Decorative 3D Terminal Element */
              <div className="auth-session-container">
                {/* Interactive Decorative Terminal Showcase */}
                <div className="auth-decorative-console-banner">
                  <div className="console-banner-content">
                    <div className="console-eyebrow">
                      <span className="console-live-dot" />
                      <span>Workstation Terminal</span>
                    </div>
                    <h3 className="console-title">Workspace Connected</h3>
                    <p className="console-desc">
                      AI analytics engine online and ready. Move your cursor to tilt the 3D terminal.
                    </p>
                  </div>
                  <div className="console-banner-visual">
                    <InteractiveMiniComputer />
                  </div>
                </div>

                {/* Primary Account Profile Card */}
                <div className="auth-session-card">
                  <div className="auth-session-header">
                    <div className="auth-session-avatar-wrap">
                      <div className="auth-session-avatar">
                        {(userDisplayName[0] || currentUser.email?.[0] || 'U').toUpperCase()}
                      </div>
                      <span className="avatar-status-indicator" title="Active Session" />
                    </div>

                    <div className="auth-session-header-text">
                      <div className="session-status-row">
                        <StatusPill label="Active Session" status="healthy" size="sm" pulse={true} />
                        {resolvedTier === 'pro' ? (
                          <span className="account-tier-badge tier-badge-pro" title="Active Pro Subscription">
                            <Crown size={12} className="tier-badge-icon" />
                            <span>PRO TIER</span>
                          </span>
                        ) : (
                          <span className="account-tier-badge tier-badge-free" title="Free Tier Account">
                            <span>FREE TIER</span>
                          </span>
                        )}
                        {isAdmin && (
                          <span className="account-tier-badge tier-badge-admin" title="Developer Diagnostics Mode">
                            <Terminal size={11} className="tier-badge-icon" />
                            <span>DEV MODE</span>
                          </span>
                        )}
                      </div>
                      <h2 className="auth-session-title">
                        You're signed in
                      </h2>
                      <div className="auth-session-user-details">
                        {userDisplayName && userDisplayName !== currentUser.email && (
                          <span className="auth-session-name">{userDisplayName}</span>
                        )}
                        <span className="auth-session-email">{currentUser.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Clean Structured Info Card for All Users */}
                  <div className="auth-session-info-card">
                    {/* Account Creation Date */}
                    <div className="auth-info-row">
                      <div className="info-row-left">
                        <div className="info-icon-box">
                          <Calendar size={15} className="text-indigo" />
                        </div>
                        <div className="info-text-group">
                          <span className="info-label">Member Since</span>
                          <span className="info-main-value">{memberSinceFormatted}</span>
                        </div>
                      </div>
                    </div>

                    {/* Plan Status */}
                    <div className="auth-info-row">
                      <div className="info-row-left">
                        <div className="info-icon-box">
                          {resolvedTier === 'pro' ? (
                            <Crown size={15} className="text-amber" />
                          ) : (
                            <Zap size={15} className="text-accent" />
                          )}
                        </div>
                        <div className="info-text-group">
                          <span className="info-label">Current Plan</span>
                          <span className="info-main-value">
                            {resolvedTier === 'pro'
                              ? 'Pro Plan — Unlimited Datasets & AI Questions'
                              : 'Free Plan — 3 Datasets & 10 AI Questions / Day'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Developer Diagnostics Panel — Only rendered for admin email */}
                  {isAdmin && (
                    <div className="auth-developer-panel">
                      <div className="developer-panel-header">
                        <div className="dev-panel-title-wrap">
                          <Terminal size={15} className="text-accent" />
                          <div>
                            <span className="dev-panel-title">Developer Diagnostics</span>
                            <span className="dev-panel-subtitle">Visible only to admin account</span>
                          </div>
                        </div>
                        <span className="dev-mode-pill">Admin Only</span>
                      </div>

                      <div className="auth-session-info-card dev-info-subcard">
                        {/* Account ID */}
                        <div className="auth-info-row">
                          <div className="info-row-left">
                            <div className="info-icon-box">
                              <Fingerprint size={15} />
                            </div>
                            <div className="info-text-group">
                              <span className="info-label">Account ID</span>
                              <code className="info-code-value" title={currentUser.id}>
                                {currentUser.id}
                              </code>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`btn-copy-id ${copiedId ? 'copied' : ''}`}
                            onClick={handleCopyId}
                            title={copiedId ? 'Copied to clipboard' : 'Copy Account ID'}
                            aria-label="Copy Account ID"
                          >
                            {copiedId ? (
                              <>
                                <Check size={13} className="text-success" />
                                <span className="copy-text text-success">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span className="copy-text">Copy</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Auth Provider */}
                        <div className="auth-info-row">
                          <div className="info-row-left">
                            <div className="info-icon-box">
                              <ShieldCheck size={15} className="text-emerald" />
                            </div>
                            <div className="info-text-group">
                              <span className="info-label">Authentication Provider</span>
                              <span className="info-main-value">Supabase Auth (Encrypted JWT)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Backend JWT Handshake Test */}
                      <div className="auth-backend-box">
                        <div className="backend-box-header">
                          <Shield size={16} className="text-accent" />
                          <div>
                            <strong>Backend JWT Verification</strong>
                            <p>Validate Bearer token against <code>GET /api/v1/auth/me</code></p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm btn-with-icon"
                          onClick={handleTestBackendMe}
                          disabled={testingBackend}
                        >
                          {testingBackend ? (
                            <>
                              <Loader2 size={14} className="spinner" />
                              <span>Verifying Token...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={14} />
                              <span>Verify JWT Token</span>
                            </>
                          )}
                        </button>

                        {backendResult && (
                          <div className="backend-result-card">
                            <div className="backend-status-row">
                              <CheckCircle2 size={14} className="text-success" />
                              <span>HTTP 200 OK — Verified by Backend</span>
                            </div>
                            <pre className="backend-json-block">
                              {JSON.stringify(backendResult, null, 2)}
                            </pre>
                          </div>
                        )}

                        {backendError && (
                          <div className="auth-inline-alert auth-inline-alert-error">
                            <AlertCircle size={15} />
                            <span>{backendError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons with rich hover states and smooth transitions */}
                  <div className="auth-session-actions">
                    <button
                      type="button"
                      className="btn-session-continue"
                      onClick={onBack}
                    >
                      <span>Continue to Workspace</span>
                      <ArrowRight size={17} className="btn-arrow-icon" />
                    </button>
                    <button
                      type="button"
                      className="btn-session-signout"
                      onClick={async () => {
                        await supabase.auth.signOut();
                        resetFeedback();
                      }}
                    >
                      <LogOut size={16} className="btn-logout-icon" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Frictionless Conversion Form */
              <div className="auth-form-wrapper">
                <div className="auth-heading-group">
                  <h1 className="auth-form-title">
                    {mode === 'login'
                      ? 'Welcome back'
                      : mode === 'signup'
                      ? 'Get started with AI Data Analyst'
                      : 'Reset your password'}
                  </h1>
                  <p className="auth-form-subtitle">
                    {mode === 'login'
                      ? 'Enter your credentials to access your data intelligence workspace.'
                      : mode === 'signup'
                      ? 'Upload CSV or Excel files, explore automated profiling, and unlock instant AI insights.'
                      : 'Enter your email address and we will send you a link to reset your password.'}
                  </p>
                </div>

                {/* Inline alerts */}
                {apiError && (
                  <div className="auth-inline-alert auth-inline-alert-error" role="alert">
                    <AlertCircle size={16} className="alert-icon-flex" />
                    <span>{apiError}</span>
                  </div>
                )}

                {apiSuccess && (
                  <div className="auth-inline-alert auth-inline-alert-success" role="status">
                    <CheckCircle2 size={16} className="alert-icon-flex" />
                    <span>{apiSuccess}</span>
                  </div>
                )}

                {!isSupabaseConfigured && (
                  <div className="auth-inline-alert auth-inline-alert-warning" role="alert">
                    <AlertCircle size={16} className="alert-icon-flex" />
                    <span>
                      Supabase key not detected. Add <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
                      <code>frontend/.env</code> to connect live authentication.
                    </span>
                  </div>
                )}

                <form className="auth-main-form" onSubmit={handleSubmit} noValidate>
                  {/* Email Field */}
                  <div className="auth-field-group">
                    <label htmlFor="auth-email" className="auth-field-label">
                      Email address
                    </label>
                    <div
                      className={`auth-input-container ${emailError ? 'has-error' : ''}`}
                    >
                      <Mail size={16} className="auth-input-icon" aria-hidden="true" />
                      <input
                        id="auth-email"
                        type="email"
                        className="auth-input"
                        placeholder="name@company.com"
                        value={email}
                        onChange={handleEmailChange}
                        onBlur={handleEmailBlur}
                        autoComplete="email"
                        aria-invalid={!!emailError}
                        aria-describedby={emailError ? 'auth-email-error' : undefined}
                        required
                      />
                    </div>
                    {emailError && (
                      <p id="auth-email-error" className="auth-field-error-message">
                        <AlertCircle size={12} />
                        <span>{emailError}</span>
                      </p>
                    )}
                  </div>

                  {/* Password Field (Only in login & signup modes) */}
                  {mode !== 'forgot-password' && (
                    <div className="auth-field-group">
                      <div className="auth-password-label-row">
                        <label htmlFor="auth-password" className="auth-field-label">
                          Password
                        </label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            className="auth-forgot-link"
                            onClick={() => handleSwitchMode('forgot-password')}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="auth-input-container">
                        <Lock size={16} className="auth-input-icon" aria-hidden="true" />
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          className="auth-input"
                          placeholder="••••••••"
                          value={password}
                          onChange={handlePasswordChange}
                          onBlur={() => setPasswordTouched(true)}
                          autoComplete={
                            mode === 'login' ? 'current-password' : 'new-password'
                          }
                          aria-label="Password"
                          required
                        />
                        <button
                          type="button"
                          className="auth-password-toggle-btn"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      {/* Friendly, reassuring inline hints */}
                      {mode === 'signup' && (
                        <div className="auth-password-validation">
                          {!passwordTouched && password.length === 0 ? (
                            <span className="password-hint">
                              Must be at least 6 characters
                            </span>
                          ) : password.length < 6 ? (
                            <span className="password-hint warning">
                              Password must be at least 6 characters ({6 - password.length}{' '}
                              more needed)
                            </span>
                          ) : (
                            <span className="password-hint success">
                              <Check size={12} />
                              <span>Password length requirement met</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Primary Action Button */}
                  <button
                    type="submit"
                    className="auth-primary-btn"
                    disabled={loading}
                    aria-label={
                      mode === 'login'
                        ? 'Log in to account'
                        : mode === 'signup'
                        ? 'Create account and get started'
                        : 'Send password reset email'
                    }
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="spinner" />
                        <span>
                          {mode === 'login'
                            ? 'Signing In...'
                            : mode === 'signup'
                            ? 'Creating Account...'
                            : 'Sending Link...'}
                        </span>
                      </>
                    ) : (
                      <span>
                        {mode === 'login'
                          ? 'Log In'
                          : mode === 'signup'
                          ? 'Get Started'
                          : 'Send Reset Link'}
                      </span>
                    )}
                  </button>
                </form>

                {/* Demoted quiet secondary switch at the bottom */}
                <div className="auth-secondary-switch">
                  {mode === 'login' && (
                    <p>
                      Don't have an account?{' '}
                      <button
                        type="button"
                        className="auth-quiet-link"
                        onClick={() => handleSwitchMode('signup')}
                      >
                        Sign up
                      </button>
                    </p>
                  )}

                  {mode === 'signup' && (
                    <p>
                      Already have an account?{' '}
                      <button
                        type="button"
                        className="auth-quiet-link"
                        onClick={() => handleSwitchMode('login')}
                      >
                        Log in
                      </button>
                    </p>
                  )}

                  {mode === 'forgot-password' && (
                    <p>
                      Remember your password?{' '}
                      <button
                        type="button"
                        className="auth-quiet-link"
                        onClick={() => handleSwitchMode('login')}
                      >
                        Back to log in
                      </button>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* =========================================================================
            RIGHT PANEL: Trust, Brand & Value Proposition
            ========================================================================= */}
        <section className="auth-panel-brand" aria-label="Platform Showcase">
          {/* Ambient radial glow backdrop */}
          <div className="auth-brand-glow" aria-hidden="true" />

          <div className="auth-brand-inner">
            {/* Value Proposition Eyebrow */}
            <div className="auth-eyebrow">
              <Sparkles size={14} className="eyebrow-sparkle-icon" />
              <span>Enterprise Data Intelligence</span>
            </div>

            {/* Core Value Proposition Headline */}
            <h2 className="auth-brand-hero-title">
              Turn your data into <span className="auth-gradient-text">instant insights</span>.
            </h2>

            <p className="auth-brand-hero-desc">
              Upload any CSV or Excel dataset to instantly generate deep statistical profiles, run
              deterministic aggregate calculations, explore interactive charts, and query your
              data with an AI analyst.
            </p>

            {/* Value Highlights Cards */}
            <div className="auth-feature-cards">
              <div className="auth-feature-item">
                <div className="auth-feature-icon-box feature-indigo">
                  <Zap size={18} />
                </div>
                <div className="auth-feature-info">
                  <h3>Sub-Second Profiling</h3>
                  <p>Infers column types, missing rates, and complete distribution statistics.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon-box feature-teal">
                  <BarChart2 size={18} />
                </div>
                <div className="auth-feature-info">
                  <h3>Pandas Analytics Engine</h3>
                  <p>Deterministic calculations (mean, sum, median, group_by) with zero lag.</p>
                </div>
              </div>

              <div className="auth-feature-item">
                <div className="auth-feature-icon-box feature-purple">
                  <ShieldCheck size={18} />
                </div>
                <div className="auth-feature-info">
                  <h3>Automated Quality Score</h3>
                  <p>Column-by-column completeness audit and data anomaly scorecard.</p>
                </div>
              </div>
            </div>

            {/* Minimalist Live Data Preview Mock Card */}
            <div className="auth-preview-mock-card">
              <div className="mock-card-header">
                <div className="mock-badge">
                  <Activity size={12} />
                  <span>Realtime Engine Ready</span>
                </div>
                <span className="mock-filename">enterprise_sales_sample.csv</span>
              </div>

              <div className="mock-metrics-row">
                <div className="mock-metric">
                  <span className="mock-metric-label">Processed</span>
                  <strong className="mock-metric-val">15,420 rows</strong>
                </div>
                <div className="mock-metric">
                  <span className="mock-metric-label">Quality Score</span>
                  <strong className="mock-metric-val text-success">98.5%</strong>
                </div>
                <div className="mock-metric">
                  <span className="mock-metric-label">Latency</span>
                  <strong className="mock-metric-val">&lt; 38ms</strong>
                </div>
              </div>

              <div className="mock-progress-bar">
                <div className="mock-progress-fill" />
              </div>
            </div>

            {/* Trust Footer Note */}
            <div className="auth-trust-footer">
              <Shield size={13} />
              <span>Secured by Supabase Auth with server-side JWT verification</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

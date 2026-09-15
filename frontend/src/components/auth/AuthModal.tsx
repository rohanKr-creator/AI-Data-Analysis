import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Info,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { getAuthMe } from '../../services/api';
import type { UserProfileResponse } from '../../types/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess: (email: string, mode: 'login' | 'signup') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Backend handshake test state
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendResult, setBackendResult] = useState<UserProfileResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBackendResult(null);
    setBackendError(null);
  };

  const handleTabSwitch = (newTab: 'login' | 'signup') => {
    setTab(newTab);
    resetMessages();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg(
        'Supabase Anon Key is not configured. Please add VITE_SUPABASE_ANON_KEY to your frontend/.env file.'
      );
      return;
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.user) {
          onAuthSuccess(data.user.email || email, 'login');
          setSuccessMsg('Successfully logged in!');
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.session) {
          // Auto-confirmed user
          onAuthSuccess(data.user?.email || email, 'signup');
          setSuccessMsg('Account created and logged in!');
          setTimeout(() => {
            onClose();
          }, 1500);
        } else if (data.user) {
          // Confirmation email sent
          setSuccessMsg(
            'Account created! Please check your email inbox to confirm your account, then sign in.'
          );
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'An unexpected error occurred.');
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="auth-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close auth dialog"
        >
          <X size={18} />
        </button>

        <div className="auth-header">
          <div className="auth-icon-badge">
            <ShieldCheck size={26} className="auth-shield-icon" />
          </div>
          <h2 className="auth-title">
            {currentUser ? 'Supabase Authentication' : tab === 'login' ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="auth-subtitle">
            {currentUser
              ? 'You are currently authenticated'
              : 'Secure email/password authentication powered by Supabase Auth'}
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="auth-alert auth-alert-warning">
            <Info size={16} className="alert-icon" />
            <div className="alert-text">
              <strong>Configuration Notice:</strong> Add <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
              <code>frontend/.env</code> to enable live Supabase authentication.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="auth-alert auth-alert-error">
            <AlertCircle size={16} className="alert-icon" />
            <div className="alert-text">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert auth-alert-success">
            <CheckCircle2 size={16} className="alert-icon" />
            <div className="alert-text">{successMsg}</div>
          </div>
        )}

        {currentUser ? (
          <div className="auth-authenticated-view">
            <div className="user-active-card">
              <div className="user-active-avatar">
                {(currentUser.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="user-active-details">
                <span className="user-active-label">Signed in as</span>
                <span className="user-active-email">{currentUser.email}</span>
                <span className="user-active-id">UUID: {currentUser.id}</span>
              </div>
            </div>

            <div className="auth-backend-test-section">
              <div className="backend-test-header">
                <h4>Backend JWT Verification</h4>
                <p>Test <code>GET /api/v1/auth/me</code> with current Supabase Bearer token</p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm btn-with-icon full-width"
                onClick={handleTestBackendMe}
                disabled={testingBackend}
              >
                {testingBackend ? (
                  <>
                    <Loader2 size={14} className="spinner" />
                    <span>Verifying JWT with Backend...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} />
                    <span>Test GET /api/v1/auth/me</span>
                  </>
                )}
              </button>

              {backendResult && (
                <div className="backend-test-success">
                  <div className="test-success-badge">
                    <CheckCircle2 size={14} />
                    <span>Backend Verified (HTTP 200 OK)</span>
                  </div>
                  <pre className="backend-json-output">
                    {JSON.stringify(backendResult, null, 2)}
                  </pre>
                </div>
              )}

              {backendError && (
                <div className="auth-alert auth-alert-error">
                  <AlertCircle size={14} className="alert-icon" />
                  <div className="alert-text">{backendError}</div>
                </div>
              )}
            </div>

            <div className="auth-actions-row">
              <button
                type="button"
                className="btn btn-secondary full-width"
                onClick={async () => {
                  await supabase.auth.signOut();
                  onClose();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tab-switch">
              <button
                type="button"
                className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('login')}
              >
                <LogIn size={15} />
                <span>Log In</span>
              </button>
              <button
                type="button"
                className={`auth-tab-btn ${tab === 'signup' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('signup')}
              >
                <UserPlus size={15} />
                <span>Sign Up</span>
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="auth-email" className="form-label">
                  Email Address
                </label>
                <div className="input-with-icon">
                  <Mail size={16} className="field-icon" />
                  <input
                    id="auth-email"
                    type="email"
                    className="form-control"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="auth-password" className="form-label">
                  Password
                </label>
                <div className="input-with-icon">
                  <Lock size={16} className="field-icon" />
                  <input
                    id="auth-password"
                    type="password"
                    className="form-control"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
                {tab === 'signup' && (
                  <span className="field-hint">Must be at least 6 characters</span>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary full-width auth-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    <span>{tab === 'login' ? 'Signing in...' : 'Creating account...'}</span>
                  </>
                ) : tab === 'login' ? (
                  <>
                    <LogIn size={16} />
                    <span>Log In</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Sign Up</span>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

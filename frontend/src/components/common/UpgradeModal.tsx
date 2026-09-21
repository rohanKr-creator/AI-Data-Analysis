import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  Zap,
  ArrowRight,
  ShieldCheck,
  Loader2,
  ExternalLink,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
import type { UserUsageResponse } from '../../types/api';
import { createCheckoutSession, createCustomerPortalSession } from '../../services/api';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userUsage: UserUsageResponse | null;
  onNotify?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  userUsage,
  onNotify,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPortalProcessing, setIsPortalProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const askLimit = userUsage?.usage.ask.limit ?? 20;
  const uploadLimit = userUsage?.usage.upload.limit ?? 5;
  const isPro = userUsage?.tier === 'pro';

  const handleUpgradeClick = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await createCheckoutSession();
      if (response.checkout_url) {
        onNotify?.('info', 'Redirecting to Stripe', 'Taking you to secure Stripe Checkout...');
        // Redirect browser to hosted Stripe Checkout session
        window.location.href = response.checkout_url;
      } else {
        throw new Error('Checkout URL not returned by server.');
      }
    } catch (err) {
      const msg = (err as Error).message || 'Failed to initiate checkout session.';
      setErrorMessage(msg);
      onNotify?.('error', 'Checkout Error', msg);
      setIsProcessing(false);
    }
  };

  const handleManageBillingClick = async () => {
    setIsPortalProcessing(true);
    setErrorMessage(null);

    try {
      const response = await createCustomerPortalSession();
      if (response.portal_url) {
        onNotify?.('info', 'Opening Customer Portal', 'Taking you to Stripe Customer Billing Portal...');
        window.location.href = response.portal_url;
      } else {
        throw new Error('Portal URL not returned by server.');
      }
    } catch (err) {
      const msg = (err as Error).message || 'Failed to open customer billing portal.';
      setErrorMessage(msg);
      onNotify?.('error', 'Billing Portal Error', msg);
      setIsPortalProcessing(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container upgrade-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="upgrade-header-brand">
            <div className="upgrade-icon-badge">
              <Sparkles size={20} className="upgrade-sparkle-icon" />
            </div>
            <div>
              <h2 className="modal-title">Upgrade to Pro</h2>
              <p className="modal-subtitle">
                Supercharge your data analytics with unrestricted AI capabilities
              </p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close upgrade modal"
            disabled={isProcessing || isPortalProcessing}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body upgrade-modal-body">
          {errorMessage && (
            <div className="alert alert-error upgrade-alert" role="alert" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Plan Comparison Grid */}
          <div className="upgrade-grid">
            {/* Free Plan Card */}
            <div className={`pricing-card ${!isPro ? 'current-plan' : ''}`}>
              <div className="pricing-card-header">
                <span className="pricing-tier-name">Free Tier</span>
                <div className="pricing-cost">
                  <span className="price">$0</span>
                  <span className="period">/ month</span>
                </div>
                <p className="pricing-desc">For testing and personal data exploration</p>
              </div>

              <ul className="pricing-features">
                <li>
                  <Check size={16} className="feature-check" />
                  <span><strong>{uploadLimit}</strong> dataset uploads per day</span>
                </li>
                <li>
                  <Check size={16} className="feature-check" />
                  <span><strong>{askLimit}</strong> AI questions per day</span>
                </li>
                <li>
                  <Check size={16} className="feature-check" />
                  <span>Standard statistical profiling</span>
                </li>
                <li>
                  <Check size={16} className="feature-check" />
                  <span>Deterministic Pandas engine</span>
                </li>
              </ul>

              <div className="pricing-footer">
                {!isPro ? (
                  <div className="plan-current-tag">Your Current Plan</div>
                ) : (
                  <div className="plan-inactive-tag">Free Tier</div>
                )}
              </div>
            </div>

            {/* Pro Plan Card */}
            <div className={`pricing-card pro-card ${isPro ? 'current-plan' : 'recommended'}`}>
              <div className="recommended-badge">
                <Zap size={13} />
                <span>RECOMMENDED</span>
              </div>

              <div className="pricing-card-header">
                <span className="pricing-tier-name pro-name">Pro Tier</span>
                <div className="pricing-cost">
                  <span className="price">$29</span>
                  <span className="period">/ month</span>
                </div>
                <p className="pricing-desc">For professional analysts and high-volume teams</p>
              </div>

              <ul className="pricing-features">
                <li>
                  <Check size={16} className="feature-check-pro" />
                  <span><strong>Unlimited</strong> dataset uploads (no daily caps)</span>
                </li>
                <li>
                  <Check size={16} className="feature-check-pro" />
                  <span><strong>Unlimited</strong> Gemini AI questions</span>
                </li>
                <li>
                  <Check size={16} className="feature-check-pro" />
                  <span>Priority Gemini 2.5 Flash latency</span>
                </li>
                <li>
                  <Check size={16} className="feature-check-pro" />
                  <span>High-memory multi-column aggregations</span>
                </li>
                <li>
                  <Check size={16} className="feature-check-pro" />
                  <span>Priority customer & security support</span>
                </li>
              </ul>

              <div className="pricing-footer">
                {isPro ? (
                  <div className="pro-actions-container">
                    <div className="plan-current-tag pro-current" style={{ marginBottom: '0.5rem' }}>
                      <ShieldCheck size={16} />
                      <span>Active Pro Member</span>
                    </div>
                    <button
                      className="btn btn-secondary btn-block btn-sm"
                      onClick={handleManageBillingClick}
                      disabled={isPortalProcessing}
                      title="Manage payment method, subscriptions, or cancel"
                    >
                      {isPortalProcessing ? (
                        <>
                          <Loader2 size={14} className="spin-icon" />
                          <span>Loading Portal...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={14} />
                          <span>Manage Subscription</span>
                          <ExternalLink size={12} />
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-block btn-upgrade-cta"
                    onClick={handleUpgradeClick}
                    disabled={isProcessing}
                    id="upgrade-to-pro-btn"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="spin-icon" />
                        <span>Connecting to Stripe...</span>
                      </>
                    ) : (
                      <>
                        <span>Upgrade to Pro</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="upgrade-modal-note">
            <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <ShieldCheck size={15} style={{ color: '#10b981' }} />
              <span>Payments secured by <strong>Stripe</strong>. 256-bit encryption. Cancel anytime with one click.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { X, Sparkles, Check, Zap, ArrowRight, ShieldCheck } from 'lucide-react';
import type { UserUsageResponse } from '../../types/api';

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
  if (!isOpen) return null;

  const askLimit = userUsage?.usage.ask.limit ?? 20;
  const uploadLimit = userUsage?.usage.upload.limit ?? 5;
  const isPro = userUsage?.tier === 'pro';

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
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body upgrade-modal-body">
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
                  <div className="plan-current-tag pro-current">
                    <ShieldCheck size={16} />
                    <span>Active Pro Member</span>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-block btn-upgrade-cta"
                    onClick={() => {
                      onNotify?.(
                        'info',
                        'Settings updated',
                        'Upgrade request registered. Pro features will activate automatically upon payment confirmation.'
                      );
                      onClose();
                    }}
                  >
                    <span>Upgrade to Pro</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="upgrade-modal-note">
            <p>
              💡 <em>Stage 4 notice:</em> Automated billing and Stripe checkout will be configured in Stage 5. To manually activate Pro tier during development, update your row in <code>user_profiles</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

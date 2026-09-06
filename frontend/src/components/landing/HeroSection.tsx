import React from 'react';
import { Sparkles, BarChart2, ShieldCheck, Zap } from 'lucide-react';

export const HeroSection: React.FC = () => {
  return (
    <div className="landing-hero">
      <div className="hero-eyebrow">
        <Sparkles size={14} className="eyebrow-sparkle" />
        <span>Enterprise Data Intelligence Platform</span>
      </div>

      <h1 className="hero-title">
        Turn your data into <span className="text-gradient">instant insights</span>.
      </h1>

      <p className="hero-description">
        Upload any CSV dataset to instantly generate deep statistical profiles, run
        deterministic aggregate calculations, explore interactive charts, and query your data
        with an AI analyst.
      </p>

      <div className="hero-features-grid">
        <div className="hero-feature-card">
          <div className="feature-icon feature-indigo">
            <Zap size={18} />
          </div>
          <div className="feature-text">
            <strong>Sub-Second Profiling</strong>
            <span>Infers types, detects null rates, and computes numeric metrics</span>
          </div>
        </div>

        <div className="hero-feature-card">
          <div className="feature-icon feature-teal">
            <BarChart2 size={18} />
          </div>
          <div className="feature-text">
            <strong>Pandas Analytics Engine</strong>
            <span>Mean, sum, median, std, and group_by aggregations with zero lag</span>
          </div>
        </div>

        <div className="hero-feature-card">
          <div className="feature-icon feature-purple">
            <ShieldCheck size={18} />
          </div>
          <div className="feature-text">
            <strong>Automated Quality Score</strong>
            <span>Full completeness scorecard and missing value audit per column</span>
          </div>
        </div>
      </div>
    </div>
  );
};

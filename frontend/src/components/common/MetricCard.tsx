import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  badgeText?: string;
  badgeType?: 'positive' | 'neutral' | 'warning' | 'indigo';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  badgeText,
  badgeType = 'indigo',
}) => {
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <span className="metric-card-title">{title}</span>
        <div className={`metric-card-icon-wrap icon-${badgeType}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="metric-card-body">
        <div className="metric-card-value">{value}</div>
        {(subtitle || badgeText) && (
          <div className="metric-card-footer">
            {badgeText && (
              <span className={`metric-badge badge-${badgeType}`}>
                {badgeText}
              </span>
            )}
            {subtitle && <span className="metric-subtitle">{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

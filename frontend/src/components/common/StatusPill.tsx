import React from 'react';

export type StatusPillType = 'healthy' | 'active' | 'ready' | 'warning' | 'neutral';

export interface StatusPillProps {
  label?: string;
  status?: StatusPillType;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
  title?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  label = 'Healthy',
  status = 'healthy',
  size = 'sm',
  pulse = true,
  className = '',
  title,
}) => {
  // Normalize semantic variants
  const variantClass =
    status === 'warning'
      ? 'status-pill-warning'
      : status === 'neutral'
      ? 'status-pill-neutral'
      : 'status-pill-healthy'; // healthy, active, ready all map to emerald

  return (
    <span
      className={`status-pill ${variantClass} status-pill-${size} ${className}`}
      title={title}
    >
      <span className="status-dot-wrapper" aria-hidden="true">
        {pulse && <span className="status-dot-ping" />}
        <span className="status-dot" />
      </span>
      <span className="status-pill-text">{label}</span>
    </span>
  );
};

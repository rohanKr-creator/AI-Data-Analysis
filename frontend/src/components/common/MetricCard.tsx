import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SparklineColor = 'emerald' | 'indigo' | 'amber' | 'cyan' | 'rose';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  badgeText?: string;
  badgeType?: 'positive' | 'neutral' | 'warning' | 'indigo';
  sparklineData?: number[];
  sparklineColor?: SparklineColor;
}

const COLOR_MAP: Record<SparklineColor, { stroke: string; glow: string }> = {
  emerald: { stroke: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
  indigo: { stroke: '#6d5dfc', glow: 'rgba(109, 93, 252, 0.4)' },
  amber: { stroke: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  cyan: { stroke: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
  rose: { stroke: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
};

const Sparkline: React.FC<{ data: number[]; color: SparklineColor }> = ({
  data,
  color,
}) => {
  const gradientId = useId();
  const width = 120;
  const height = 30;
  const padTop = 4;
  const padBottom = 4;
  const usableHeight = height - padTop - padBottom;

  const validData = data.filter((n) => typeof n === 'number' && !isNaN(n));
  if (validData.length < 2) return null;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min === 0 ? 1 : max - min;

  const points = validData.map((val, idx) => {
    const x = (idx / (validData.length - 1)) * width;
    const y = padTop + (1 - (val - min) / range) * usableHeight;
    return { x, y };
  });

  // Build smooth cubic bezier path
  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const cpX1 = p0.x + dx * 0.45;
    const cpY1 = p0.y;
    const cpX2 = p0.x + dx * 0.55;
    const cpY2 = p1.y;
    linePath += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  const palette = COLOR_MAP[color] || COLOR_MAP.indigo;

  return (
    <svg
      className="metric-sparkline-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={palette.stroke} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Smooth curve */}
      <path
        d={linePath}
        fill="none"
        stroke={palette.stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Glowing terminal endpoint */}
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="4.5"
        fill={palette.glow}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="2"
        fill={palette.stroke}
      />
    </svg>
  );
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  badgeText,
  badgeType = 'indigo',
  sparklineData,
  sparklineColor,
}) => {
  // Determine sparkline color if not explicitly provided
  const resolvedSparklineColor: SparklineColor =
    sparklineColor ||
    (badgeType === 'positive'
      ? 'emerald'
      : badgeType === 'warning'
      ? 'amber'
      : badgeType === 'neutral'
      ? 'cyan'
      : 'indigo');

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

        {sparklineData && sparklineData.length >= 2 && (
          <div className="metric-sparkline-container">
            <Sparkline data={sparklineData} color={resolvedSparklineColor} />
          </div>
        )}

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

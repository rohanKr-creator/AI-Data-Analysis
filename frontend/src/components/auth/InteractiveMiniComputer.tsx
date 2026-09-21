import React, { useState, useEffect, useRef } from 'react';

interface InteractiveMiniComputerProps {
  className?: string;
}

export const InteractiveMiniComputer: React.FC<InteractiveMiniComputerProps> = ({
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [screenCursor, setScreenCursor] = useState({ x: 80, y: 54 });
  const [isHovered, setIsHovered] = useState(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      rafId.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Relative delta from container center, normalized to [-1, 1] range across viewport
        const winWidth = window.innerWidth || 1200;
        const winHeight = window.innerHeight || 800;

        const normX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (winWidth / 2)));
        const normY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (winHeight / 2)));

        // Gentle, bounded 3D tilt
        const rotY = normX * 14; // up to 14 deg horizontal tilt
        const rotX = -normY * 12; // up to 12 deg vertical tilt

        setTilt({ x: rotX, y: rotY });

        // Constrained mini cursor on screen:
        // Screen bounds in SVG: x in [38, 122], y in [34, 76]
        const minX = 40;
        const maxX = 120;
        const minY = 36;
        const maxY = 74;

        const targetX = 80 + normX * 36;
        const targetY = 55 + normY * 18;

        setScreenCursor({
          x: Math.max(minX, Math.min(maxX, targetX)),
          y: Math.max(minY, Math.min(maxY, targetY)),
        });
      });
    };

    const handleMouseLeave = () => {
      setTilt({ x: 0, y: 0 });
      setScreenCursor({ x: 80, y: 54 });
      setIsHovered(false);
    };

    const handleMouseEnter = () => {
      setIsHovered(true);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mouseenter', handleMouseEnter);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (container) {
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`mini-computer-root ${className}`}
      aria-hidden="true"
      style={{
        perspective: '900px',
      }}
    >
      <div
        className="mini-computer-stage"
        style={{
          transform: `perspective(900px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`,
          transition: isHovered
            ? 'transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1)'
            : 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        <svg
          viewBox="0 0 160 135"
          width="160"
          height="135"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mini-computer-svg"
        >
          <defs>
            {/* Ambient Base Glow */}
            <radialGradient id="desk-shadow-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6d5dfc" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#6d5dfc" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#6d5dfc" stopOpacity="0" />
            </radialGradient>

            {/* Chassis Gradient */}
            <linearGradient id="chassis-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e2333" />
              <stop offset="50%" stopColor="#151926" />
              <stop offset="100%" stopColor="#0d101a" />
            </linearGradient>

            {/* Screen Bezel Gradient */}
            <linearGradient id="bezel-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(109, 93, 252, 0.6)" />
              <stop offset="50%" stopColor="rgba(129, 140, 248, 0.2)" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0.4)" />
            </linearGradient>

            {/* Screen Glass Gradient */}
            <linearGradient id="screen-glass" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#080a10" />
              <stop offset="100%" stopColor="#0e121d" />
            </linearGradient>

            {/* Chart Area Fill */}
            <linearGradient id="chart-area-fill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6d5dfc" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#6d5dfc" stopOpacity="0" />
            </linearGradient>

            {/* Glass Glare */}
            <linearGradient id="glass-reflection" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Cursor Glow Filter */}
            <filter id="cursor-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Ambient Ground Reflection / Shadow */}
          <ellipse cx="80" cy="123" rx="55" ry="8" fill="url(#desk-shadow-glow)" />

          {/* 2. Mini Workstation Keyboard / Base Mat */}
          <path
            d="M 46 112 L 114 112 L 123 122 L 37 122 Z"
            fill="#141824"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="0.75"
          />
          {/* Key rows hint */}
          <rect x="48" y="114" width="64" height="2" rx="1" fill="#252c40" />
          <rect x="46" y="117.5" width="68" height="2" rx="1" fill="#252c40" />
          {/* Trackpad */}
          <rect x="72" y="120" width="16" height="1.5" rx="0.5" fill="#3b4461" />

          {/* 3. Monitor Stand & Base */}
          {/* Base plate */}
          <rect
            x="64"
            y="104"
            width="32"
            height="5"
            rx="2.5"
            fill="#1c2130"
            stroke="rgba(109, 93, 252, 0.3)"
            strokeWidth="0.8"
          />
          {/* Stand neck */}
          <path
            d="M 75 88 L 85 88 L 83 104 L 77 104 Z"
            fill="url(#chassis-grad)"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth="0.8"
          />

          {/* 4. Monitor Chassis */}
          <rect
            x="24"
            y="14"
            width="112"
            height="74"
            rx="8"
            fill="url(#chassis-grad)"
            stroke="url(#bezel-stroke-grad)"
            strokeWidth="1.2"
          />

          {/* 5. Inner Screen Frame */}
          <rect
            x="29"
            y="19"
            width="102"
            height="64"
            rx="5"
            fill="url(#screen-glass)"
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth="1"
          />

          {/* 6. Window Title Bar on Screen */}
          <rect x="29" y="19" width="102" height="10" rx="3" fill="#131724" />
          {/* Traffic light dots */}
          <circle cx="36" cy="24" r="1.7" fill="#ef4444" />
          <circle cx="41.5" cy="24" r="1.7" fill="#f59e0b" />
          <circle cx="47" cy="24" r="1.7" fill="#10b981" />

          {/* Miniature Title Bar Text */}
          <rect x="54" y="22.5" width="28" height="3" rx="1.5" fill="#3b4461" />
          <circle cx="123" cy="24" r="1.5" fill="#6d5dfc" />

          {/* 7. Screen Analytics Content */}
          {/* Subtle Grid Lines */}
          <line x1="33" y1="46" x2="127" y2="46" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="2 2" />
          <line x1="33" y1="62" x2="127" y2="62" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="2 2" />

          {/* Data Sparkline Area */}
          <path
            d="M 35 73 L 35 60 Q 48 45, 62 55 T 86 38 T 106 48 T 125 35 L 125 73 Z"
            fill="url(#chart-area-fill)"
          />
          {/* Data Sparkline Stroke */}
          <path
            d="M 35 60 Q 48 45, 62 55 T 86 38 T 106 48 T 125 35"
            stroke="#6d5dfc"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Mini Bar Chart Highlights */}
          <rect x="36" y="64" width="3" height="8" rx="1" fill="#38bdf8" opacity="0.85" />
          <rect x="42" y="58" width="3" height="14" rx="1" fill="#818cf8" opacity="0.9" />
          <rect x="48" y="62" width="3" height="10" rx="1" fill="#34d399" opacity="0.9" />
          <rect x="54" y="55" width="3" height="17" rx="1" fill="#6d5dfc" opacity="0.95" />

          {/* Mini Data Metrics Lines */}
          <rect x="94" y="62" width="22" height="2" rx="1" fill="#64748b" opacity="0.5" />
          <rect x="94" y="67" width="16" height="2" rx="1" fill="#64748b" opacity="0.3" />

          {/* 8. Interactive Cursor Element on Screen */}
          <g>
            {/* Pulsing ring around cursor */}
            <circle
              cx={screenCursor.x}
              cy={screenCursor.y}
              r="4.5"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="0.8"
              opacity="0.5"
              className="mini-cursor-ping"
            />
            {/* Glowing active dot */}
            <circle
              cx={screenCursor.x}
              cy={screenCursor.y}
              r="2.2"
              fill="#38bdf8"
              filter="url(#cursor-glow)"
            />
          </g>

          {/* 9. Diagonal Glass Reflection */}
          <path
            d="M 29 19 L 85 19 L 55 83 L 29 83 Z"
            fill="url(#glass-reflection)"
            pointerEvents="none"
          />

          {/* 10. Status LED on Bezel */}
          <circle cx="80" cy="84" r="1" fill="#10b981" />
          <circle cx="80" cy="84" r="2.5" fill="#10b981" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
};

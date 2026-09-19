import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastNotification } from '../../types/dashboard';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  autoDismissMs?: number;
}

const ToastItem: React.FC<{
  toast: ToastNotification;
  onDismiss: (id: string) => void;
  durationMs: number;
}> = ({ toast, onDismiss, durationMs }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeLeftRef = useRef(durationMs);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused || isExiting) return;

    startTimeRef.current = Date.now();
    const remaining = timeLeftRef.current;

    // Start fade out slightly before total dismissal
    const exitLeadTime = 280;
    const timeUntilExit = Math.max(50, remaining - exitLeadTime);

    const exitTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, timeUntilExit);

    timerRef.current = window.setTimeout(() => {
      onDismiss(toast.id);
    }, remaining);

    return () => {
      clearTimeout(exitTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      timeLeftRef.current -= Date.now() - startTimeRef.current;
    };
  }, [isPaused, isExiting, toast.id, onDismiss]);

  const handleManualDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  };

  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
      ? AlertCircle
      : Info;

  return (
    <div
      className={`toast toast-${toast.type} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
    >
      <div className="toast-icon-badge">
        <Icon size={16} />
      </div>

      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-message">{toast.message}</div>
      </div>

      <button
        className="toast-close"
        onClick={handleManualDismiss}
        aria-label="Close notification"
        type="button"
      >
        <X size={14} />
      </button>

      {/* 2.5s Progress Bar */}
      <div
        className="toast-progress-bar"
        style={{
          animationDuration: `${durationMs}ms`,
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      />
    </div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
  autoDismissMs = 2500, // ~2.5s auto-dismiss as requested
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          durationMs={autoDismissMs}
        />
      ))}
    </div>
  );
};

import React from 'react';
import type { User } from '@supabase/supabase-js';
import { AuthPage } from './AuthPage';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess: (email: string, mode: 'login' | 'signup') => void;
}

/**
 * @deprecated Prefer navigating to the full-page split-screen AuthPage route (/login or /signup).
 * This component is maintained for backwards compatibility.
 */
export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <AuthPage
      currentUser={currentUser}
      onAuthSuccess={onAuthSuccess}
      onBack={onClose}
    />
  );
};

export { AuthPage } from './AuthPage';
export default AuthModal;

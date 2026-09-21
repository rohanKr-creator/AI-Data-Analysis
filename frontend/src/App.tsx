import { useState, useCallback, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ToastContainer } from './components/common/ToastContainer';
import { HeroSection } from './components/landing/HeroSection';
import { DropzoneUpload } from './components/landing/DropzoneUpload';
import { OverviewTab } from './components/dashboard/OverviewTab';
import { ExplorerTab } from './components/dashboard/ExplorerTab';
import { AnalysisTab } from './components/dashboard/AnalysisTab';
import { ChartsTab } from './components/dashboard/ChartsTab';
import { QualityTab } from './components/dashboard/QualityTab';
import { AiAnalystTab } from './components/dashboard/AiAnalystTab';
import { AuthPage } from './components/auth/AuthPage';
import { UpgradeModal } from './components/common/UpgradeModal';
import { getDatasetProfile, uploadDataset, getUserUsage } from './services/api';
import { calculateQualityReport } from './services/aiAnalystService';
import { supabase } from './lib/supabaseClient';
import type { DatasetProfileResponse, DatasetUploadResponse, UserUsageResponse } from './types/api';
import type { DashboardTab, ToastNotification } from './types/dashboard';
import './App.css';

let toastCounter = 0;

const getRouteFromPath = (): { view: 'dashboard' | 'auth'; mode: 'login' | 'signup' } => {
  const path = window.location.pathname.toLowerCase();
  if (path === '/signup') {
    return { view: 'auth', mode: 'signup' };
  }
  if (path === '/login' || path === '/auth') {
    return { view: 'auth', mode: 'login' };
  }
  return { view: 'dashboard', mode: 'login' };
};

export function App() {
  const initialRoute = getRouteFromPath();
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'auth'>(initialRoute.view);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(initialRoute.mode);
  const [uploadedDataset, setUploadedDataset] =
    useState<DatasetUploadResponse | null>(null);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userUsage, setUserUsage] = useState<UserUsageResponse | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState<boolean>(false);

  const refreshUsage = useCallback(async () => {
    try {
      const usageData = await getUserUsage();
      setUserUsage(usageData);
    } catch {
      // Offline or unauthenticated
    }
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      const route = getRouteFromPath();
      setCurrentView(route.view);
      setAuthMode(route.mode);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setCurrentUser(session?.user ?? null);
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setSessionLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setSessionLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshUsage();
    } else {
      setUserUsage(null);
    }
  }, [currentUser, refreshUsage]);

  const navigateToAuth = useCallback((mode: 'login' | 'signup' = 'login') => {
    const target = mode === 'signup' ? '/signup' : '/login';
    window.history.pushState({}, '', target);
    setAuthMode(mode);
    setCurrentView('auth');
  }, []);

  const handleBackToWorkspace = useCallback(() => {
    window.history.pushState({}, '', '/');
    setCurrentView('dashboard');
  }, []);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message: string) => {
      const id = `toast-${Date.now()}-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Handle return from Stripe Checkout (success or cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();

    if (path.includes('/billing/success') || params.has('session_id')) {
      const cleanPath = window.location.pathname.replace(/\/billing\/success\/?/i, '/') || '/';
      window.history.replaceState({}, document.title, cleanPath);
      setTimeout(() => {
        addToast(
          'success',
          'Welcome to Pro! 🎉',
          'Your Pro subscription is now active! Enjoy unlimited uploads and Gemini AI questions.'
        );
        refreshUsage();
      }, 0);
    } else if (path.includes('/billing/cancelled')) {
      const cleanPath = window.location.pathname.replace(/\/billing\/cancelled\/?/i, '/') || '/';
      window.history.replaceState({}, document.title, cleanPath);
      setTimeout(() => {
        addToast(
          'info',
          'Upgrade Cancelled',
          'Stripe checkout was cancelled. You can upgrade to Pro at any time.'
        );
      }, 0);
    }
  }, [addToast, refreshUsage]);

  const handleAuthSuccess = useCallback(
    (email: string, mode: 'login' | 'signup') => {
      window.history.pushState({}, '', '/');
      setCurrentView('dashboard');
      addToast(
        'success',
        mode === 'login' ? 'Welcome Back!' : 'Account Created!',
        `Signed in as ${email}`
      );
    },
    [addToast]
  );

  const handleUploadSuccess = useCallback(
    async (data: DatasetUploadResponse) => {
      setUploadedDataset(data);
      setProfile(null);
      setProfileLoading(true);
      addToast(
        'success',
        'Upload successful',
        `Successfully uploaded ${data.filename} (${data.row_count?.toLocaleString() ?? 0} rows).`
      );

      try {
        const profileData = await getDatasetProfile(data.dataset_id);
        setProfile(profileData);
        setActiveTab('overview');
        refreshUsage();
        addToast(
          'info',
          'Analysis complete',
          `Inferred ${profileData.column_count} features with automated statistical summaries.`
        );
      } catch (err) {
        addToast('error', 'Profiling Failed', (err as Error).message);
      } finally {
        setProfileLoading(false);
      }
    },
    [addToast, refreshUsage]
  );

  const handleNewUpload = () => {
    setUploadedDataset(null);
    setProfile(null);
    setActiveTab('overview');
    setMobileMenuOpen(false);
  };

  const handleLoadDemo = useCallback(async () => {
    const demoCsvData = `employee_id,name,department,salary,sales_amount,customer_rating,hire_year
EMP-101,Sarah Jenkins,Engineering,115000,240000,4.8,2021
EMP-102,David Chen,Sales,88000,520000,4.6,2022
EMP-103,Marcus Vance,Marketing,76000,190000,4.2,2020
EMP-104,Elena Rostova,Engineering,125000,310000,4.9,2019
EMP-105,James Wilson,Sales,92000,480000,4.5,2021
EMP-106,Amira Patel,Product,105000,340000,4.7,2022
EMP-107,Lucas Silva,Marketing,72000,165000,4.1,2023
EMP-108,Maya Lin,Sales,95000,540000,4.9,2020
EMP-109,Thomas Wright,Engineering,110000,280000,4.4,2021
EMP-110,Chloe Martin,Product,102000,295000,4.6,2023
EMP-111,Kenji Takahashi,Engineering,130000,360000,5.0,2018
EMP-112,Rachel Green,Sales,89000,450000,4.3,2022
EMP-113,Omar Hassan,Marketing,81000,210000,4.4,2021
EMP-114,Lisa Taylor,Sales,97000,560000,4.8,2019
EMP-115,Robert Diaz,Engineering,118000,305000,4.7,2020`;

    const demoBlob = new Blob([demoCsvData], { type: 'text/csv' });
    const demoFile = new File([demoBlob], 'enterprise_sales_sample.csv', {
      type: 'text/csv',
    });

    addToast('info', 'Loading Sample', 'Uploading realistic enterprise sample dataset...');
    try {
      const uploadRes = await uploadDataset(demoFile);
      handleUploadSuccess(uploadRes);
    } catch (err) {
      addToast('error', 'Sample Load Error', (err as Error).message);
    }
  }, [addToast, handleUploadSuccess]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setUserUsage(null);
      setUploadedDataset(null);
      setProfile(null);
      window.history.pushState({}, '', '/login');
      setAuthMode('login');
      setCurrentView('auth');
      addToast('info', 'Signed Out', 'You have been signed out successfully.');
    } catch (err) {
      addToast('error', 'Sign Out Error', (err as Error).message);
    }
  }, [addToast]);

  const qualityScore = profile ? calculateQualityReport(profile).score : undefined;

  // 1. Session check loading state (prevents flash of unauthenticated page)
  if (sessionLoading) {
    return (
      <div className="saas-app-layout session-loading-screen">
        <div className="loading-canvas">
          <div className="spinner-large" />
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Initializing AI Data Analyst...</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>Verifying secure session</p>
        </div>
      </div>
    );
  }

  // 2. Gate: Unauthenticated users ONLY see AuthPage (no platform/landing access)
  if (!currentUser) {
    return (
      <div className="saas-app-layout">
        <AuthPage
          initialMode={authMode}
          currentUser={null}
          onBack={() => {
            addToast(
              'info',
              'Authentication Required',
              'Please log in or create an account to access the platform.'
            );
          }}
          onAuthSuccess={handleAuthSuccess}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // 3. Authenticated user explicitly viewing Auth/Profile view
  if (currentView === 'auth') {
    return (
      <div className="saas-app-layout">
        <AuthPage
          initialMode={authMode}
          currentUser={currentUser}
          onBack={handleBackToWorkspace}
          onAuthSuccess={handleAuthSuccess}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="saas-app-layout">
      {/* Top SaaS Header */}
      <Navbar
        profile={profile}
        onNewUpload={handleNewUpload}
        onLoadDemo={handleLoadDemo}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        currentUser={currentUser}
        userUsage={userUsage}
        onOpenAuth={() => navigateToAuth('login')}
        onOpenUpgrade={() => setUpgradeModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Body */}
      {!profile ? (
        /* Empty / Landing View */
        <main className="landing-container">
          <HeroSection />
          <DropzoneUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={(errMsg) => addToast('error', 'Upload Issue', errMsg)}
            onOpenUpgrade={() => setUpgradeModalOpen(true)}
          />
        </main>
      ) : (
        /* Authenticated/Profiled Dashboard View */
        <div className="dashboard-container">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            profile={profile}
            qualityScore={qualityScore}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            onNewUpload={handleNewUpload}
            userUsage={userUsage}
            onOpenUpgrade={() => setUpgradeModalOpen(true)}
          />

          <main className="dashboard-content-area">
            {profileLoading ? (
              <div className="loading-canvas">
                <div className="spinner-large" />
                <h3>Generating Deep Dataset Profile...</h3>
                <p>Running statistical profiling and schema validation</p>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab
                    uploadedDataset={uploadedDataset}
                    profile={profile}
                    onNavigateTab={setActiveTab}
                  />
                )}

                {activeTab === 'explorer' && <ExplorerTab profile={profile} />}

                {activeTab === 'analysis' && (
                  <AnalysisTab
                    datasetId={uploadedDataset?.dataset_id || profile.dataset_id}
                    profile={profile}
                    onAnalysisExecuted={(res) =>
                      addToast(
                        'success',
                        'Analysis complete',
                        `Computed ${res.operation} for column ${res.column}`
                      )
                    }
                  />
                )}

                {activeTab === 'charts' && <ChartsTab key={profile.dataset_id} profile={profile} />}

                {activeTab === 'quality' && <QualityTab profile={profile} />}

                {activeTab === 'ai-analyst' && (
                  <AiAnalystTab
                    profile={profile}
                    onQuestionAsked={refreshUsage}
                    onOpenUpgrade={() => setUpgradeModalOpen(true)}
                  />
                )}
              </>
            )}
          </main>
        </div>
      )}

      {/* Upgrade Plan Modal */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        userUsage={userUsage}
        onNotify={addToast}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;

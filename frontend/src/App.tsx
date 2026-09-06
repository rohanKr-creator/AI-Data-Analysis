import { useState, useCallback } from 'react';
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
import { getDatasetProfile, uploadDataset } from './services/api';
import { calculateQualityReport } from './services/aiAnalystService';
import type { DatasetProfileResponse, DatasetUploadResponse } from './types/api';
import type { DashboardTab, ToastNotification } from './types/dashboard';
import './App.css';

let toastCounter = 0;

export function App() {
  const [uploadedDataset, setUploadedDataset] =
    useState<DatasetUploadResponse | null>(null);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message: string) => {
      const id = `toast-${Date.now()}-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleUploadSuccess = useCallback(
    async (data: DatasetUploadResponse) => {
      setUploadedDataset(data);
      setProfile(null);
      setProfileLoading(true);
      addToast(
        'success',
        'Dataset Stored',
        `Successfully uploaded ${data.filename} (${data.row_count?.toLocaleString() ?? 0} rows).`
      );

      try {
        const profileData = await getDatasetProfile(data.dataset_id);
        setProfile(profileData);
        setActiveTab('overview');
        addToast(
          'info',
          'Profiling Complete',
          `Inferred ${profileData.column_count} features with automated statistical summaries.`
        );
      } catch (err) {
        addToast('error', 'Profiling Failed', (err as Error).message);
      } finally {
        setProfileLoading(false);
      }
    },
    [addToast]
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

  const qualityScore = profile ? calculateQualityReport(profile).score : undefined;

  return (
    <div className="saas-app-layout">
      {/* Top SaaS Header */}
      <Navbar
        profile={profile}
        onNewUpload={handleNewUpload}
        onLoadDemo={handleLoadDemo}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
      />

      {/* Main Body */}
      {!profile ? (
        /* Empty / Landing View */
        <main className="landing-container">
          <HeroSection />
          <DropzoneUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={(errMsg) => addToast('error', 'Upload Issue', errMsg)}
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
                        'Calculation Succeeded',
                        `Computed ${res.operation} for column ${res.column}`
                      )
                    }
                  />
                )}

                {activeTab === 'charts' && <ChartsTab profile={profile} />}

                {activeTab === 'quality' && <QualityTab profile={profile} />}

                {activeTab === 'ai-analyst' && <AiAnalystTab profile={profile} />}
              </>
            )}
          </main>
        </div>
      )}

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;

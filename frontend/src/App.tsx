import { useState, useCallback } from 'react';
import { UploadSection } from './components/UploadSection';
import { ProfileSection } from './components/ProfileSection';
import { AnalyzeSection } from './components/AnalyzeSection';
import { getDatasetProfile } from './services/api';
import type { DatasetProfileResponse, DatasetUploadResponse } from './types/api';
import './App.css';

export function App() {
  const [uploadedDataset, setUploadedDataset] =
    useState<DatasetUploadResponse | null>(null);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const handleUploadSuccess = useCallback(async (data: DatasetUploadResponse) => {
    setUploadedDataset(data);
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);

    try {
      const profileData = await getDatasetProfile(data.dataset_id);
      setProfile(profileData);
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  return (
    <div className="container">
      <header className="app-header">
        <h1>AI Data Analyst</h1>
        <p className="subtitle">Interactive Dataset Profiler & Analytics</p>
      </header>

      <main className="main-content">
        {/* Section 1: Upload */}
        <UploadSection
          onUploadSuccess={handleUploadSuccess}
          uploadedDataset={uploadedDataset}
        />

        {/* Section 2: Profile (auto-fetched on upload) */}
        <ProfileSection
          profile={profile}
          loading={profileLoading}
          error={profileError}
        />

        {/* Section 3: Analyze */}
        <AnalyzeSection
          datasetId={uploadedDataset ? uploadedDataset.dataset_id : null}
          profile={profile}
        />
      </main>
    </div>
  );
}

export default App;

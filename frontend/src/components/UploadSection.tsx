import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet } from 'lucide-react';
import { uploadDataset } from '../services/api';
import type { DatasetUploadResponse } from '../types/api';

interface UploadSectionProps {
  onUploadSuccess: (data: DatasetUploadResponse) => void;
  uploadedDataset: DatasetUploadResponse | null;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onUploadSuccess,
  uploadedDataset,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a CSV file to upload.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await uploadDataset(selectedFile);
      onUploadSuccess(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2 className="section-title">
        <UploadCloud size={19} className="section-icon" />
        1. Upload Dataset
      </h2>
      <form onSubmit={handleUpload} className="upload-form">
        <label htmlFor="csv-file-input">Select CSV File:</label>
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={loading}
        />
        <button
          id="upload-button"
          type="submit"
          disabled={loading || !selectedFile}
          className="btn-with-icon"
        >
          <UploadCloud size={15} />
          {loading ? 'Uploading...' : 'Upload CSV'}
        </button>
      </form>

      {error && (
        <div className="alert alert-error" role="alert">
          <strong>Upload Error:</strong> {error}
        </div>
      )}

      {uploadedDataset && (
        <div className="metadata-box">
          <h3 className="subsection-title">
            <FileSpreadsheet size={16} className="subsection-icon" />
            Uploaded Dataset Details
          </h3>
          <table className="info-table">
            <tbody>
              <tr>
                <th>Dataset ID:</th>
                <td><code>{uploadedDataset.dataset_id}</code></td>
              </tr>
              <tr>
                <th>Original Filename:</th>
                <td>{uploadedDataset.filename}</td>
              </tr>
              <tr>
                <th>Row Count:</th>
                <td>{uploadedDataset.row_count ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Column Count:</th>
                <td>{uploadedDataset.column_count ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>File Size:</th>
                <td>{(uploadedDataset.size_bytes / 1024).toFixed(2)} KB</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

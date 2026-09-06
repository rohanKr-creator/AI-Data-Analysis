import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileCheck,
  AlertCircle,
  PlayCircle,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { uploadDataset } from '../../services/api';
import type { DatasetUploadResponse } from '../../types/api';

interface DropzoneUploadProps {
  onUploadSuccess: (data: DatasetUploadResponse) => void;
  onUploadError?: (error: string) => void;
}

export const DropzoneUpload: React.FC<DropzoneUploadProps> = ({
  onUploadSuccess,
  onUploadError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      const err = 'Only CSV files (.csv) are currently supported.';
      setError(err);
      onUploadError?.(err);
      return;
    }

    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const err = `File exceeds maximum limit of 25MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
      setError(err);
      onUploadError?.(err);
      return;
    }

    setSelectedFile(file);
    setIsUploading(true);
    setError(null);
    setProgress(20);

    // Realistic progress animation during network transfer
    const interval = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 15 : p));
    }, 120);

    try {
      const result = await uploadDataset(file);
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        onUploadSuccess(result);
      }, 400);
    } catch (err) {
      clearInterval(interval);
      setIsUploading(false);
      const errMsg = (err as Error).message || 'Failed to upload dataset.';
      setError(errMsg);
      onUploadError?.(errMsg);
    }
  }, [onUploadSuccess, onUploadError]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUpload(e.target.files[0]);
    }
  };

  // Demo Dataset Generator & Instant Loader
  const handleLoadDemo = () => {
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
    const demoFile = new File([demoBlob], 'enterprise_sales_employees.csv', {
      type: 'text/csv',
    });
    processUpload(demoFile);
  };

  return (
    <div className="dropzone-wrapper">
      <div
        className={`dropzone-card ${isDragging ? 'dropzone-dragging' : ''} ${
          isUploading ? 'dropzone-uploading' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={isUploading}
        />

        <div className="dropzone-content">
          <div className="dropzone-icon-bubble">
            {isUploading ? (
              <FileCheck size={32} className="icon-pulse icon-accent" />
            ) : (
              <UploadCloud size={32} className="icon-accent" />
            )}
          </div>

          <h2 className="dropzone-title">
            {isUploading
              ? `Processing ${selectedFile?.name}...`
              : 'Drop your CSV file here, or browse files'}
          </h2>

          <p className="dropzone-subtitle">
            Instant profiling • Deterministic Pandas aggregations • Maximum 25MB
          </p>

          {!isUploading && (
            <div className="dropzone-actions">
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FileText size={16} />
                <span>Select CSV File</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-with-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadDemo();
                }}
              >
                <PlayCircle size={16} />
                <span>Try Sample Dataset</span>
              </button>
            </div>
          )}

          {isUploading && (
            <div className="upload-progress-container">
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="upload-progress-labels">
                <span>Validating structure & uploading to database...</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="dropzone-alert alert alert-error" role="alert">
          <ShieldAlert size={18} className="alert-icon" />
          <div className="alert-content">
            <strong>Upload Failed:</strong> {error}
          </div>
        </div>
      )}

      <div className="dropzone-footer-specs">
        <span className="spec-badge">
          <AlertCircle size={12} /> RFC 4180 CSV standard
        </span>
        <span className="spec-badge">UTF-8 encoding</span>
        <span className="spec-badge">Auto type inference (int, float, bool, date)</span>
        <span className="spec-badge">PostgreSQL & Disk storage</span>
      </div>
    </div>
  );
};

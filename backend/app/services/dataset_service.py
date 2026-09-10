import io
import uuid
from pathlib import Path
from typing import BinaryIO, Optional, Tuple
import pandas as pd
from sqlalchemy.orm import Session
from app.core.config import settings
from app.schemas.dataset import DatasetUploadResponse
from app.services.file_validator import (
    validate_file_metadata,
    read_and_validate_stream,
    sanitize_filename,
    InvalidFileFormatError,
    EmptyFileError,
    DatasetValidationError,
)
from app.services.storage_service import storage_service


class DatasetNotFoundError(DatasetValidationError):
    """Raised when a dataset cannot be located in the database or storage."""
    pass


class DatasetService:
    """Service handling dataset upload lifecycle and persistence in Supabase Storage."""

    def __init__(self, upload_dir: Path | None = None):
        self.upload_dir = upload_dir or settings.upload_path

    def process_csv_upload(
        self,
        file_stream: BinaryIO,
        original_filename: str,
        content_type: str | None,
    ) -> DatasetUploadResponse:
        """
        Validate file metadata, stream into memory while enforcing size limits,
        compute row and column counts using Pandas in memory, and upload to Supabase Storage.
        
        Args:
            file_stream: Binary IO stream from UploadFile.
            original_filename: User-provided filename.
            content_type: HTTP Content-Type header.
            
        Returns:
            DatasetUploadResponse with metadata.
        """
        # Step 1: Validate filename and MIME type
        clean_filename = validate_file_metadata(original_filename, content_type)

        # Step 2: Stream into memory with size limit enforcement
        file_bytes = read_and_validate_stream(
            file_stream=file_stream,
            max_size_bytes=settings.MAX_UPLOAD_SIZE_BYTES,
        )

        # Step 3: Verify CSV readability and compute row and column counts in memory
        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
            row_count = int(df.shape[0])
            column_count = int(df.shape[1])
        except Exception as err:
            raise InvalidFileFormatError(
                f"File could not be parsed as a valid CSV dataset: {str(err)}"
            )

        if row_count == 0:
            raise EmptyFileError("CSV file contains no data rows.")

        # Step 4: Generate unique target destination key and upload to Supabase Storage
        dataset_id = str(uuid.uuid4())
        destination_filename = f"{dataset_id}_{clean_filename}"

        storage_service.upload_file(
            file_bytes=file_bytes,
            filename=destination_filename,
            content_type=content_type or "text/csv",
        )

        return DatasetUploadResponse(
            dataset_id=dataset_id,
            filename=clean_filename,
            size_bytes=len(file_bytes),
            content_type=content_type or "text/csv",
            row_count=row_count,
            column_count=column_count,
            message="CSV dataset uploaded and validated successfully.",
        )

    def get_dataset_file(
        self,
        dataset_id: str,
        db: Optional[Session] = None,
    ) -> Tuple[str, str]:
        """
        Locate dataset storage path in Supabase Storage by dataset_id.
        
        Args:
            dataset_id: The identifier assigned during upload.
            db: Optional database session. If None, creates a temporary session.
            
        Returns:
            Tuple of (storage_path, original_filename).
            
        Raises:
            DatasetNotFoundError: If dataset is not found in database.
        """
        from app.models.dataset import Dataset
        from app.core.database import SessionLocal

        clean_id = sanitize_filename(dataset_id)
        try:
            dataset_uuid = uuid.UUID(clean_id)
        except (ValueError, AttributeError):
            raise DatasetNotFoundError(f"Dataset with ID '{dataset_id}' not found.")

        close_session = False
        if db is None:
            db = SessionLocal()
            close_session = True

        try:
            dataset = db.query(Dataset).filter(Dataset.id == dataset_uuid).first()
            if not dataset:
                raise DatasetNotFoundError(f"Dataset with ID '{dataset_id}' not found.")
            return dataset.filename, dataset.original_filename
        finally:
            if close_session:
                db.close()


dataset_service = DatasetService()

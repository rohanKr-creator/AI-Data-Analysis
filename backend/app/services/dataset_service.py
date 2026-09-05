import uuid
from pathlib import Path
from typing import BinaryIO
import pandas as pd
from app.core.config import settings
from app.schemas.dataset import DatasetUploadResponse
from app.services.file_validator import (
    validate_file_metadata,
    stream_validate_and_save,
    sanitize_filename,
    InvalidFileFormatError,
    EmptyFileError,
    DatasetValidationError,
)


class DatasetNotFoundError(DatasetValidationError):
    """Raised when a dataset cannot be located on disk by its dataset_id."""
    pass


class DatasetService:
    """Service handling dataset upload lifecycle and persistence."""

    def __init__(self, upload_dir: Path | None = None):
        self.upload_dir = upload_dir or settings.upload_path

    def process_csv_upload(
        self,
        file_stream: BinaryIO,
        original_filename: str,
        content_type: str | None,
    ) -> DatasetUploadResponse:
        """
        Validate, stream to disk, and verify a CSV dataset upload.
        
        Args:
            file_stream: Binary IO stream from UploadFile.
            original_filename: User-provided filename.
            content_type: HTTP Content-Type header.
            
        Returns:
            DatasetUploadResponse with metadata.
        """
        # Step 1: Validate filename and MIME type
        clean_filename = validate_file_metadata(original_filename, content_type)

        # Step 2: Prepare unique target destination
        dataset_id = str(uuid.uuid4())
        destination_filename = f"{dataset_id}_{clean_filename}"
        destination_path = self.upload_dir / destination_filename

        # Step 3: Stream and validate size limits
        size_bytes, saved_path = stream_validate_and_save(
            file_stream=file_stream,
            destination_path=destination_path,
            max_size_bytes=settings.MAX_UPLOAD_SIZE_BYTES,
        )

        # Step 4: Verify CSV readability and compute row and column counts
        try:
            df = pd.read_csv(saved_path)
            row_count = int(df.shape[0])
            column_count = int(df.shape[1])
        except Exception as err:
            if saved_path.exists():
                try:
                    saved_path.unlink()
                except OSError:
                    pass
            raise InvalidFileFormatError(
                f"File could not be parsed as a valid CSV dataset: {str(err)}"
            )

        if row_count == 0:
            if saved_path.exists():
                try:
                    saved_path.unlink()
                except OSError:
                    pass
            raise EmptyFileError("CSV file contains no data rows.")

        return DatasetUploadResponse(
            dataset_id=dataset_id,
            filename=clean_filename,
            size_bytes=size_bytes,
            content_type=content_type or "text/csv",
            row_count=row_count,
            column_count=column_count,
            message="CSV dataset uploaded and validated successfully.",
        )

    def get_dataset_file(self, dataset_id: str) -> tuple[Path, str]:
        """
        Locate dataset file on disk by dataset_id.
        
        Args:
            dataset_id: The identifier assigned during upload.
            
        Returns:
            Tuple of (file_path, original_filename).
            
        Raises:
            DatasetNotFoundError: If no matching file exists on disk.
        """
        clean_id = sanitize_filename(dataset_id)
        if not clean_id:
            raise DatasetNotFoundError(f"Dataset with ID '{dataset_id}' not found.")

        matching_files = list(self.upload_dir.glob(f"{clean_id}_*.csv"))
        if not matching_files or not matching_files[0].is_file():
            raise DatasetNotFoundError(f"Dataset with ID '{dataset_id}' not found.")

        saved_file = matching_files[0]
        # Extract original filename by stripping the leading "{dataset_id}_"
        original_filename = saved_file.name.replace(f"{clean_id}_", "", 1)
        return saved_file, original_filename


dataset_service = DatasetService()

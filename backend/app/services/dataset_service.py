import uuid
from pathlib import Path
from typing import BinaryIO
import pandas as pd
from app.core.config import settings
from app.schemas.dataset import DatasetUploadResponse
from app.services.file_validator import (
    validate_file_metadata,
    stream_validate_and_save,
    InvalidFileFormatError,
    EmptyFileError,
)


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

        # Step 4: Verify CSV readability (detect corrupt or binary files)
        try:
            # Read first 5 rows to confirm CSV structure and encoding
            df_preview = pd.read_csv(saved_path, nrows=5)
        except Exception as err:
            if saved_path.exists():
                try:
                    saved_path.unlink()
                except OSError:
                    pass
            raise InvalidFileFormatError(
                f"File could not be parsed as a valid CSV dataset: {str(err)}"
            )

        if df_preview.empty:
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
            message="CSV dataset uploaded and validated successfully.",
        )


dataset_service = DatasetService()

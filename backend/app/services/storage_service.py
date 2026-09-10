import logging
from typing import Any, Optional
from supabase import Client, create_client
from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Base exception for storage operations."""
    pass


class StorageUploadError(StorageError):
    """Raised when uploading a file to storage fails."""
    pass


class StorageDownloadError(StorageError):
    """Raised when downloading a file from storage fails."""
    pass


class StorageFileNotFoundError(StorageError):
    """Raised when a requested file does not exist in storage."""
    pass


class StorageService:
    """Service wrapping Supabase Storage bucket operations for datasets."""

    def __init__(
        self,
        client: Optional[Any] = None,
        bucket_name: Optional[str] = None,
    ):
        self._client = client
        self.bucket_name = bucket_name or settings.SUPABASE_BUCKET_NAME

    def get_client(self) -> Any:
        """Initialize or return the cached Supabase client."""
        if self._client is not None:
            return self._client

        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise StorageError(
                "Supabase URL and Service Role Key must be configured to access storage."
            )

        self._client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        return self._client

    def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "text/csv",
    ) -> str:
        """
        Upload file bytes to the Supabase Storage bucket.

        Args:
            file_bytes: Binary contents of the file.
            filename: Destination storage path/key within the bucket.
            content_type: MIME content type of the file.

        Returns:
            The storage path/key in the bucket.

        Raises:
            StorageUploadError: If upload fails.
        """
        try:
            client = self.get_client()
            bucket = client.storage.from_(self.bucket_name)
            file_options = {"content-type": content_type}
            bucket.upload(path=filename, file=file_bytes, file_options=file_options)
            logger.info("Successfully uploaded %s (%d bytes) to bucket '%s'", filename, len(file_bytes), self.bucket_name)
            return filename
        except Exception as err:
            logger.error("Failed to upload %s to Supabase Storage: %s", filename, str(err))
            raise StorageUploadError(
                f"Failed to upload file '{filename}' to Supabase Storage: {str(err)}"
            ) from err

    def download_file(self, storage_path: str) -> bytes:
        """
        Download file bytes from the Supabase Storage bucket into memory.

        Args:
            storage_path: The storage path/key within the bucket.

        Returns:
            Binary contents of the file as bytes.

        Raises:
            StorageFileNotFoundError: If the file does not exist in the bucket.
            StorageDownloadError: If download fails for any other reason.
        """
        try:
            client = self.get_client()
            bucket = client.storage.from_(self.bucket_name)
            data = bucket.download(storage_path)
            if data is None:
                raise StorageFileNotFoundError(
                    f"File '{storage_path}' not found in Supabase Storage bucket '{self.bucket_name}'."
                )
            return data
        except StorageFileNotFoundError:
            raise
        except Exception as err:
            err_msg = str(err).lower()
            if "not found" in err_msg or "404" in err_msg or "not_found" in err_msg:
                raise StorageFileNotFoundError(
                    f"File '{storage_path}' not found in Supabase Storage bucket '{self.bucket_name}'."
                ) from err
            logger.error("Failed to download %s from Supabase Storage: %s", storage_path, str(err))
            raise StorageDownloadError(
                f"Failed to download file '{storage_path}' from Supabase Storage: {str(err)}"
            ) from err

    def delete_file(self, storage_path: str) -> None:
        """
        Delete a file from the Supabase Storage bucket (e.g. for rollbacks or cleanup).

        Args:
            storage_path: The storage path/key within the bucket.
        """
        try:
            client = self.get_client()
            bucket = client.storage.from_(self.bucket_name)
            bucket.remove([storage_path])
            logger.info("Deleted %s from bucket '%s'", storage_path, self.bucket_name)
        except Exception as err:
            logger.warning("Failed to delete %s from Supabase Storage: %s", storage_path, str(err))


storage_service = StorageService()

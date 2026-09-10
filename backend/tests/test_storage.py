import pytest
from app.services.storage_service import (
    StorageService,
    StorageError,
    StorageFileNotFoundError,
    storage_service,
)
from app.core.config import settings


def test_storage_upload_and_download():
    """Test uploading a file to storage and downloading it back."""
    test_content = b"col1,col2\nval1,val2\n"
    filename = "test_upload_and_download.csv"

    saved_path = storage_service.upload_file(test_content, filename)
    assert saved_path == filename

    downloaded = storage_service.download_file(filename)
    assert downloaded == test_content


def test_storage_download_not_found():
    """Test that downloading a non-existent file raises StorageFileNotFoundError."""
    with pytest.raises(StorageFileNotFoundError):
        storage_service.download_file("non_existent_file_12345.csv")


def test_storage_delete_file():
    """Test deleting a file from storage removes it from subsequent downloads."""
    test_content = b"a,b\n1,2\n"
    filename = "file_to_delete.csv"

    storage_service.upload_file(test_content, filename)
    assert storage_service.download_file(filename) == test_content

    storage_service.delete_file(filename)

    with pytest.raises(StorageFileNotFoundError):
        storage_service.download_file(filename)


def test_storage_missing_config(monkeypatch):
    """Test that unconfigured credentials raise StorageError when client initialized."""
    svc = StorageService(client=None, bucket_name="datasets")
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")

    with pytest.raises(StorageError) as exc_info:
        svc.get_client()
    assert "configured" in str(exc_info.value).lower()

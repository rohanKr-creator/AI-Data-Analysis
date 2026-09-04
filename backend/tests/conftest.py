import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.main import app
from app.services.dataset_service import dataset_service


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Provide a test client for FastAPI application."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def configure_test_upload_dir(tmp_path_factory):
    """Isolate uploads to a temporary directory for each test run."""
    temp_dir = tmp_path_factory.mktemp("test_uploads")
    original_dir = dataset_service.upload_dir
    dataset_service.upload_dir = temp_dir
    yield temp_dir
    dataset_service.upload_dir = original_dir

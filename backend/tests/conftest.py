import sys
from pathlib import Path
from typing import Any, Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.core.database import Base, get_db
from app.main import app
from app.services.dataset_service import dataset_service
from app.services.storage_service import storage_service


class MockStorageBucket:
    """In-memory mock for Supabase Storage Bucket."""

    def __init__(self):
        self._files: dict[str, bytes] = {}

    def upload(self, path: str, file: Any, file_options: Any = None) -> dict:
        if isinstance(file, bytes):
            data = file
        elif hasattr(file, "read"):
            data = file.read()
        else:
            data = bytes(file)
        self._files[path] = data
        return {"Key": path}

    def download(self, path: str) -> bytes:
        if path not in self._files:
            raise Exception(f"The resource was not found: {path}")
        return self._files[path]

    def remove(self, paths: list[str]) -> list:
        removed = []
        for p in paths:
            if p in self._files:
                del self._files[p]
                removed.append({"name": p})
        return removed


class MockSupabaseClient:
    """In-memory mock for Supabase Client."""

    def __init__(self):
        self._bucket = MockStorageBucket()

    @property
    def storage(self):
        return self

    def from_(self, bucket_name: str) -> MockStorageBucket:
        return self._bucket


# Dedicated in-memory SQLite database for testing:
# - Runs purely in RAM
# - Completely isolated from the real PostgreSQL database
# - Zero risk of polluting or mutating production/development data
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


@pytest.fixture(autouse=True)
def setup_test_db() -> Generator[None, None, None]:
    """Create fresh database tables for each test and drop them after completion."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide an isolated database session for direct assertions in test functions."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def override_db_dependency() -> Generator[None, None, None]:
    """Override FastAPI's get_db dependency to point to the in-memory test database."""
    def _get_test_db() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_test_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Provide a test client for FastAPI application."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def mock_supabase_storage():
    """Mock Supabase Storage client with an in-memory dictionary for isolated testing."""
    mock_client = MockSupabaseClient()
    original_client = storage_service._client
    storage_service._client = mock_client
    yield mock_client
    storage_service._client = original_client


@pytest.fixture(autouse=True)
def configure_test_upload_dir(tmp_path_factory):
    """Isolate uploads to a temporary directory for each test run."""
    temp_dir = tmp_path_factory.mktemp("test_uploads")
    original_dir = dataset_service.upload_dir
    dataset_service.upload_dir = temp_dir
    yield temp_dir
    dataset_service.upload_dir = original_dir

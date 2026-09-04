import io
from fastapi.testclient import TestClient
from app.core.config import settings


def test_upload_valid_csv(client: TestClient):
    """Test successful upload of a well-formed CSV file."""
    csv_content = b"id,name,category,sales\n1,Widget A,Hardware,150.5\n2,Gadget B,Electronics,299.99\n"
    files = {"file": ("test_sales.csv", io.BytesIO(csv_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201

    data = response.json()
    assert "dataset_id" in data
    assert data["filename"] == "test_sales.csv"
    assert data["size_bytes"] == len(csv_content)
    assert data["content_type"] == "text/csv"
    assert "created_at" in data


def test_upload_unsupported_file_extension(client: TestClient):
    """Test that uploading non-CSV files is rejected with 400."""
    json_content = b'{"name": "test"}'
    files = {"file": ("data.json", io.BytesIO(json_content), "application/json")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 400
    assert "Unsupported file extension" in response.json()["detail"]


def test_upload_empty_csv(client: TestClient):
    """Test that uploading a 0-byte file is rejected with 400."""
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_upload_corrupted_csv(client: TestClient):
    """Test that binary/corrupt file disguised as CSV is rejected with 400."""
    binary_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00"
    files = {"file": ("fake.csv", io.BytesIO(binary_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 400
    assert "could not be parsed" in response.json()["detail"].lower()


def test_upload_exceeds_size_limit(client: TestClient, monkeypatch):
    """Test that files exceeding configured size limit are rejected with 413."""
    # Temporarily set limit to 100 bytes for test
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 100)

    oversized_content = b"a,b,c\n" + (b"1,2,3\n" * 50)  # ~300 bytes
    files = {"file": ("large.csv", io.BytesIO(oversized_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 413
    assert "exceeds maximum allowed limit" in response.json()["detail"]


def test_filename_sanitization(client: TestClient):
    """Test that path traversal attempts in filename are sanitized."""
    csv_content = b"col1,col2\nval1,val2\n"
    files = {"file": ("../../etc/passwd.csv", io.BytesIO(csv_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201

    data = response.json()
    assert "/" not in data["filename"]
    assert "\\" not in data["filename"]
    assert data["filename"] == "passwd.csv"

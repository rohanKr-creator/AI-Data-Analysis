import io
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.dataset import Dataset


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
    assert data["row_count"] == 2
    assert data["column_count"] == 4
    assert "created_at" in data


def test_upload_creates_database_row(client: TestClient, db_session: Session):
    """Test that CSV upload creates a corresponding row in the datasets table."""
    csv_content = b"name,score,grade\nAlice,95,A\nBob,82,B\nCharlie,77,C\n"
    files = {"file": ("students.csv", io.BytesIO(csv_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201
    dataset_id = response.json()["dataset_id"]

    # Verify directly against database
    record = db_session.query(Dataset).filter(Dataset.id == uuid.UUID(dataset_id)).first()
    assert record is not None
    assert record.original_filename == "students.csv"
    assert record.filename == f"{dataset_id}_students.csv"
    assert record.size_bytes == len(csv_content)
    assert record.content_type == "text/csv"
    assert record.row_count == 3
    assert record.column_count == 3
    assert record.created_at is not None


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


def test_upload_header_only_csv(client: TestClient):
    """Test that uploading a CSV with headers but no data rows is rejected with 400."""
    files = {"file": ("headers_only.csv", io.BytesIO(b"id,name,category\n"), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 400
    assert "no data rows" in response.json()["detail"].lower()


def test_upload_corrupted_csv(client: TestClient):
    """Test that binary/corrupt file disguised as CSV is rejected with 400."""
    binary_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00"
    files = {"file": ("fake.csv", io.BytesIO(binary_content), "text/csv")}

    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 400
    assert "could not be parsed" in response.json()["detail"].lower()


def test_upload_exceeds_size_limit(client: TestClient, monkeypatch):
    """Test that files exceeding configured size limit are rejected with 413."""
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


def test_profile_valid_dataset(client: TestClient):
    """Test profiling a valid uploaded dataset with mixed types and null values."""
    csv_content = (
        b"name,age,salary,is_active\n"
        b"Alice,25,50000.0,True\n"
        b"Bob,30,75000.0,False\n"
        b"Charlie,,60000.0,True\n"
        b"Diana,40,,False\n"
    )
    files = {"file": ("employees.csv", io.BytesIO(csv_content), "text/csv")}

    # Step 1: Upload dataset
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # Step 2: Request profile
    profile_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile_res.status_code == 200

    profile = profile_res.json()
    assert profile["dataset_id"] == dataset_id
    assert profile["filename"] == "employees.csv"
    assert profile["row_count"] == 4
    assert profile["column_count"] == 4

    # Verify column summaries
    col_map = {c["name"]: c for c in profile["columns"]}
    assert "name" in col_map
    assert col_map["name"]["null_count"] == 0
    assert col_map["name"]["data_type"] == "string"

    assert "age" in col_map
    assert col_map["age"]["null_count"] == 1
    assert col_map["age"]["null_percentage"] == 25.0

    assert "salary" in col_map
    assert col_map["salary"]["null_count"] == 1

    assert "is_active" in col_map
    assert col_map["is_active"]["data_type"] == "boolean"

    # Verify numeric summary statistics
    numeric = profile["numeric_summary"]
    assert "salary" in numeric
    assert numeric["salary"]["min"] == 50000.0
    assert numeric["salary"]["max"] == 75000.0
    assert abs(numeric["salary"]["mean"] - 61666.6667) < 0.1
    assert numeric["salary"]["std"] is not None

    assert "age" in numeric
    assert numeric["age"]["min"] == 25.0
    assert numeric["age"]["max"] == 40.0

    # Verify preview rows and null handling
    assert len(profile["preview"]) == 4
    assert profile["preview"][0]["name"] == "Alice"
    assert profile["preview"][0]["salary"] == 50000.0
    assert profile["preview"][2]["age"] is None
    assert profile["preview"][3]["salary"] is None


def test_profile_dataset_database_lookup(client: TestClient, db_session: Session):
    """Test that profiling retrieves metadata via database lookup."""
    csv_content = b"x,y\n10,20\n30,40\n"
    files = {"file": ("coords.csv", io.BytesIO(csv_content), "text/csv")}

    upload_res = client.post("/api/v1/datasets/upload", files=files)
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # Verify row exists in DB
    db_record = db_session.query(Dataset).filter(Dataset.id == uuid.UUID(dataset_id)).first()
    assert db_record is not None

    # Fetch profile via GET endpoint
    profile_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile_res.status_code == 200
    assert profile_res.json()["dataset_id"] == dataset_id
    assert profile_res.json()["row_count"] == db_record.row_count
    assert profile_res.json()["column_count"] == db_record.column_count


def test_profile_dataset_not_found_in_database(client: TestClient):
    """Test that requesting a profile for a non-existent UUID in database returns 404."""
    non_existent_uuid = str(uuid.uuid4())
    response = client.get(f"/api/v1/datasets/{non_existent_uuid}/profile")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_profile_dataset_invalid_uuid(client: TestClient):
    """Test that requesting a profile with an invalid UUID format returns 404."""
    response = client.get("/api/v1/datasets/invalid-uuid-string/profile")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

import io
import uuid
from fastapi.testclient import TestClient


SAMPLE_CSV = (
    b"name,department,salary,age,is_active\n"
    b"Alice,Engineering,75000.0,30,True\n"
    b"Bob,Engineering,85000.0,35,True\n"
    b"Charlie,Marketing,60000.0,28,False\n"
    b"Diana,Marketing,65000.0,32,True\n"
    b"Evan,Design,70000.0,26,False\n"
)


def _upload_sample_dataset(client: TestClient) -> str:
    """Helper to upload a sample CSV dataset and return its dataset_id."""
    files = {"file": ("company_staff.csv", io.BytesIO(SAMPLE_CSV), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["dataset_id"]


def test_analyze_valid_numeric_mean(client: TestClient):
    """Test computing the mean of a valid numeric column."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "salary",
        "operation": "mean",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["dataset_id"] == dataset_id
    assert data["operation"] == "mean"
    assert data["column"] == "salary"
    assert data["group_by"] is None
    assert data["columns"] == ["salary"]
    # (75000 + 85000 + 60000 + 65000 + 70000) / 5 = 355000 / 5 = 71000.0
    assert data["result"] == 71000.0
    assert data["row_count"] == 5


def test_analyze_valid_numeric_operations(client: TestClient):
    """Test sum, min, max, median, and std on numeric column."""
    dataset_id = _upload_sample_dataset(client)

    # Sum
    res_sum = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "salary", "operation": "sum"},
    )
    assert res_sum.status_code == 200
    assert res_sum.json()["result"] == 355000.0

    # Min
    res_min = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "salary", "operation": "min"},
    )
    assert res_min.status_code == 200
    assert res_min.json()["result"] == 60000.0

    # Max
    res_max = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "salary", "operation": "max"},
    )
    assert res_max.status_code == 200
    assert res_max.json()["result"] == 85000.0

    # Median
    res_med = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "salary", "operation": "median"},
    )
    assert res_med.status_code == 200
    assert res_med.json()["result"] == 70000.0

    # Count
    res_cnt = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "salary", "operation": "count"},
    )
    assert res_cnt.status_code == 200
    assert res_cnt.json()["result"] == 5


def test_analyze_valid_group_by(client: TestClient):
    """Test computing mean salary grouped by department."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "salary",
        "operation": "mean",
        "group_by": "department",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["operation"] == "mean"
    assert data["column"] == "salary"
    assert data["group_by"] == "department"
    assert set(data["columns"]) == {"salary", "department"}
    assert data["row_count"] == 5

    results = data["result"]
    assert results["Engineering"] == 80000.0  # (75000 + 85000) / 2
    assert results["Marketing"] == 62500.0    # (60000 + 65000) / 2
    assert results["Design"] == 70000.0


def test_analyze_value_counts(client: TestClient):
    """Test value_counts frequency operation on categorical/string column."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "department",
        "operation": "value_counts",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["operation"] == "value_counts"
    assert data["column"] == "department"
    assert data["result"]["Engineering"] == 2
    assert data["result"]["Marketing"] == 2
    assert data["result"]["Design"] == 1


def test_analyze_non_existent_column(client: TestClient):
    """Test that requesting an unknown column returns 400 and lists available columns."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "non_existent_col",
        "operation": "mean",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 400

    detail = response.json()["detail"]
    assert "not found in dataset" in detail
    assert "Available columns are:" in detail
    assert "salary" in detail
    assert "department" in detail


def test_analyze_invalid_operation_for_column_type(client: TestClient):
    """Test that requesting 'mean' on a string column returns 400 with an explicit explanation."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "name",
        "operation": "mean",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 400

    detail = response.json()["detail"]
    assert "requires a numeric column" in detail
    assert "string" in detail


def test_analyze_non_existent_dataset_id(client: TestClient):
    """Test that requesting analysis on a non-existent dataset UUID returns 404."""
    random_id = str(uuid.uuid4())
    payload = {
        "column": "salary",
        "operation": "mean",
    }
    response = client.post(f"/api/v1/datasets/{random_id}/analyze", json=payload)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_analyze_invalid_dataset_uuid_format(client: TestClient):
    """Test that requesting analysis with an invalid UUID format returns 404."""
    payload = {
        "column": "salary",
        "operation": "mean",
    }
    response = client.post("/api/v1/datasets/not-a-valid-uuid/analyze", json=payload)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_analyze_non_existent_group_by_column(client: TestClient):
    """Test that providing an invalid group_by column returns 400 with available columns."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "salary",
        "operation": "mean",
        "group_by": "missing_dept",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 400

    detail = response.json()["detail"]
    assert "Group-by column 'missing_dept' not found" in detail
    assert "Available columns are:" in detail


def test_analyze_unsupported_operation(client: TestClient):
    """Test that requesting an unrecognized operation returns 400 with list of supported ops."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "salary",
        "operation": "predict_future_trends",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 400

    detail = response.json()["detail"]
    assert "Unsupported operation 'predict_future_trends'" in detail
    assert "Supported operations are:" in detail

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


def test_analyze_histogram(client: TestClient):
    """Test histogram binned distribution operation on numeric column."""
    dataset_id = _upload_sample_dataset(client)

    payload = {
        "column": "salary",
        "operation": "histogram",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["operation"] == "histogram"
    assert data["column"] == "salary"
    assert isinstance(data["result"], dict)
    assert len(data["result"]) > 0
    # Sum of counts across all bins should equal total valid rows (5)
    total_binned = sum(data["result"].values())
    assert total_binned == 5


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


def test_enterprise_staff_dataset_aggregation(client: TestClient):
    """Test full-dataset aggregation on the 15-row enterprise employee dataset."""
    csv_data = (
        b"EMPLOYEE_ID,NAME,DEPARTMENT,SALARY,SALES_AMOUNT,CUSTOMER_RATING,HIRE_YEAR\n"
        b"EMP-101,Sarah Jenkins,Engineering,115000,240000,4.8,2021\n"
        b"EMP-102,David Chen,Sales,88000,520000,4.6,2022\n"
        b"EMP-103,Marcus Vance,Marketing,76000,190000,4.2,2020\n"
        b"EMP-104,Elena Rostova,Engineering,125000,310000,4.9,2019\n"
        b"EMP-105,James Wilson,Sales,92000,480000,4.5,2021\n"
        b"EMP-106,Amira Patel,Product,105000,340000,4.7,2022\n"
        b"EMP-107,Lucas Silva,Marketing,72000,165000,4.1,2023\n"
        b"EMP-108,Maya Lin,Sales,95000,540000,4.9,2020\n"
        b"EMP-109,Thomas Wright,Engineering,110000,280000,4.4,2021\n"
        b"EMP-110,Chloe Martin,Product,102000,295000,4.6,2023\n"
        b"EMP-111,Kenji Takahashi,Engineering,130000,360000,5.0,2018\n"
        b"EMP-112,Rachel Green,Sales,89000,450000,4.3,2022\n"
        b"EMP-113,Omar Hassan,Marketing,81000,210000,4.4,2021\n"
        b"EMP-114,Lisa Taylor,Sales,97000,560000,4.8,2019\n"
        b"EMP-115,Robert Diaz,Engineering,118000,305000,4.7,2020\n"
    )
    files = {"file": ("enterprise_staff.csv", io.BytesIO(csv_data), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files)
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # Verify profiling returns accurate unique_count
    profile_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile_res.status_code == 200
    columns_map = {c["name"]: c for c in profile_res.json()["columns"]}
    assert columns_map["EMPLOYEE_ID"]["unique_count"] == 15
    assert columns_map["NAME"]["unique_count"] == 15
    assert columns_map["DEPARTMENT"]["unique_count"] == 4
    assert columns_map["SALARY"]["unique_count"] == 15

    # Verify group_by sum on salary across departments
    sum_res = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"column": "SALARY", "operation": "sum", "group_by": "DEPARTMENT"},
    )
    assert sum_res.status_code == 200
    res_data = sum_res.json()["result"]
    assert res_data["Engineering"] == 598000
    assert res_data["Sales"] == 461000
    assert res_data["Marketing"] == 229000
    assert res_data["Product"] == 207000
    assert sum(res_data.values()) == 1495000



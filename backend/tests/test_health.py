from datetime import datetime
from fastapi.testclient import TestClient


def test_root_health_check(client: TestClient):
    """Test that the top-level /health endpoint returns 200 OK and expected structure."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert "environment" in data
    assert "version" in data
    assert "timestamp" in data

    parsed_time = datetime.fromisoformat(data["timestamp"])
    assert parsed_time is not None


def test_api_v1_health_check(client: TestClient):
    """Test that the versioned /api/v1/health endpoint returns 200 OK and valid schema."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert data["environment"] == "development"
    assert "timestamp" in data

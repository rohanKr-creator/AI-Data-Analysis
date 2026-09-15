import pytest
from fastapi.testclient import TestClient
from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app


def test_auth_me_missing_token(client: TestClient):
    """Test that calling /auth/me without an Authorization header returns 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "detail" in response.json()
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_auth_me_invalid_bearer_format(client: TestClient):
    """Test that calling /auth/me with an invalid scheme returns 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
    )
    assert response.status_code == 401


def test_auth_me_malformed_token(client: TestClient):
    """Test that calling /auth/me with a malformed JWT string returns 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert response.status_code == 401
    assert "detail" in response.json()


def test_auth_me_valid_user(client: TestClient):
    """Test that /auth/me returns the user profile when authenticated."""
    mock_user = AuthenticatedUser(
        id="user-uuid-1234-5678",
        email="analyst@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"name": "Alice Analyst"},
    )

    # Use FastAPI dependency override to verify endpoint contracts
    app.dependency_overrides[get_current_user] = lambda: mock_user
    try:
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer mock-valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-uuid-1234-5678"
        assert data["email"] == "analyst@example.com"
        assert data["role"] == "authenticated"
        assert data["app_metadata"]["provider"] == "email"
        assert data["user_metadata"]["name"] == "Alice Analyst"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_auth_me_empty_bearer_token(client: TestClient):
    """Test that empty Bearer token returns 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer "},
    )
    assert response.status_code == 401

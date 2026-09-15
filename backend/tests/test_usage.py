import io
import json
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_user
from app.main import app
from app.models.user_profile import UsageEvent, UserProfile
from app.services.usage_service import usage_service

SAMPLE_CSV = (
    b"name,department,salary\n"
    b"Alice,Engineering,75000\n"
    b"Bob,Marketing,65000\n"
)


def _upload_test_dataset(client: TestClient, filename: str = "test.csv") -> str:
    files = {"file": (filename, io.BytesIO(SAMPLE_CSV), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["dataset_id"]


def test_new_user_gets_free_tier_by_default(client: TestClient, db_session: Session):
    """Test that a new authenticated user defaults to the 'free' tier upon first request."""
    new_user_id = "user-brand-new-uuid-001"
    new_user = AuthenticatedUser(
        id=new_user_id,
        email="newuser@example.com",
        role="authenticated",
        app_metadata={},
        user_metadata={},
    )

    app.dependency_overrides[get_current_user] = lambda: new_user
    try:
        res = client.get("/api/v1/auth/me")
        assert res.status_code == 200
        data = res.json()
        assert data["user_id"] == new_user_id
        assert data["tier"] == "free"

        # Verify persisted in database
        profile = db_session.query(UserProfile).filter(UserProfile.user_id == new_user_id).first()
        assert profile is not None
        assert profile.tier == "free"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_usage_tracking_increments_correctly(client: TestClient, db_session: Session):
    """Test that metered actions properly record events and increment usage counts."""
    # 1. Initial usage summary should be 0
    res = client.get("/api/v1/auth/usage")
    assert res.status_code == 200
    usage_data = res.json()
    assert usage_data["tier"] == "free"
    assert usage_data["usage"]["upload"]["used"] == 0
    assert usage_data["usage"]["upload"]["limit"] == 5
    assert usage_data["usage"]["upload"]["remaining"] == 5
    assert usage_data["usage"]["ask"]["used"] == 0
    assert usage_data["usage"]["ask"]["limit"] == 20
    assert usage_data["usage"]["ask"]["remaining"] == 20

    # 2. Upload dataset and verify upload count increments
    dataset_id = _upload_test_dataset(client, "dataset_1.csv")
    res = client.get("/api/v1/auth/usage")
    usage_data = res.json()
    assert usage_data["usage"]["upload"]["used"] == 1
    assert usage_data["usage"]["upload"]["remaining"] == 4

    # 3. Ask question and verify ask count increments
    mock_intent = MagicMock()
    mock_intent.text = json.dumps({
        "can_answer": True,
        "operation": "mean",
        "column": "salary",
        "group_by": None,
        "reason": None,
    })
    mock_explain = MagicMock()
    mock_explain.text = "Average salary is 70000."
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [mock_intent, mock_explain]

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        ask_res = client.post(
            f"/api/v1/datasets/{dataset_id}/ask",
            json={"question": "What is the average salary?"},
        )
        assert ask_res.status_code == 200

    res = client.get("/api/v1/auth/usage")
    usage_data = res.json()
    assert usage_data["usage"]["ask"]["used"] == 1
    assert usage_data["usage"]["ask"]["remaining"] == 19


def test_upload_limit_enforcement_returns_429(client: TestClient):
    """Test that free tier user is blocked with 429 after exceeding max uploads per day (5)."""
    # Upload 5 files successfully
    for i in range(5):
        _upload_test_dataset(client, f"dataset_{i}.csv")

    # 6th upload should hit quota and return 429
    files = {"file": ("dataset_blocked.csv", io.BytesIO(SAMPLE_CSV), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 429
    error_data = res.json()
    assert "Free tier limit reached: 5 uploads per day" in error_data["detail"]
    assert "Upgrade to Pro" in error_data["detail"]


def test_ask_limit_enforcement_returns_429(client: TestClient, db_session: Session):
    """Test that free tier user is blocked with 429 after exceeding max questions per day (20)."""
    dataset_id = _upload_test_dataset(client, "dataset_ask.csv")

    from tests.conftest import TEST_USER_ID

    # Directly insert 20 ask events to reach limit
    for _ in range(20):
        event = UsageEvent(user_id=TEST_USER_ID, event_type="ask")
        db_session.add(event)
    db_session.commit()

    # 21st question should return 429
    res = client.post(
        f"/api/v1/datasets/{dataset_id}/ask",
        json={"question": "Any question?"},
    )
    assert res.status_code == 429
    error_data = res.json()
    assert "Free tier limit reached: 20 questions per day" in error_data["detail"]
    assert "Upgrade to Pro" in error_data["detail"]


def test_pro_tier_bypasses_all_limits(client: TestClient, db_session: Session):
    """Test that a user upgraded to 'pro' tier can exceed daily limits without 429."""
    from tests.conftest import TEST_USER_ID

    # Set user profile to 'pro'
    profile = usage_service.get_or_create_profile(db_session, TEST_USER_ID)
    profile.tier = "pro"
    db_session.commit()

    # Simulate heavy existing usage for today (10 uploads, 50 questions)
    for _ in range(10):
        db_session.add(UsageEvent(user_id=TEST_USER_ID, event_type="upload"))
    for _ in range(50):
        db_session.add(UsageEvent(user_id=TEST_USER_ID, event_type="ask"))
    db_session.commit()

    # Check /usage endpoint reflects pro tier
    res = client.get("/api/v1/auth/usage")
    assert res.status_code == 200
    usage_data = res.json()
    assert usage_data["tier"] == "pro"
    assert usage_data["usage"]["upload"]["unlimited"] is True
    assert usage_data["usage"]["upload"]["limit"] is None
    assert usage_data["usage"]["ask"]["unlimited"] is True
    assert usage_data["usage"]["ask"]["limit"] is None

    # Pro user can still upload
    dataset_id = _upload_test_dataset(client, "pro_dataset.csv")

    # Pro user can still ask questions
    mock_intent = MagicMock()
    mock_intent.text = json.dumps({
        "can_answer": True,
        "operation": "mean",
        "column": "salary",
        "group_by": None,
        "reason": None,
    })
    mock_explain = MagicMock()
    mock_explain.text = "Average salary is 70000."
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [mock_intent, mock_explain]

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        ask_res = client.post(
            f"/api/v1/datasets/{dataset_id}/ask",
            json={"question": "What is the average salary?"},
        )
        assert ask_res.status_code == 200

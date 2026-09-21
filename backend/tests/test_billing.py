from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import stripe

from app.core.config import settings
from app.models.user_profile import UserProfile
from tests.conftest import TEST_USER_ID, TEST_USER_EMAIL


@pytest.fixture(autouse=True)
def configure_stripe_test_settings():
    """Ensure mock Stripe keys are present during test runs."""
    old_key = settings.STRIPE_SECRET_KEY
    old_wh = settings.STRIPE_WEBHOOK_SECRET
    settings.STRIPE_SECRET_KEY = "sk_test_mock_secret_key_12345"
    settings.STRIPE_WEBHOOK_SECRET = "whsec_mock_signing_secret_67890"
    yield
    settings.STRIPE_SECRET_KEY = old_key
    settings.STRIPE_WEBHOOK_SECRET = old_wh


def test_checkout_session_creation(client: TestClient):
    """Test authenticated user can create a Stripe checkout session for Pro tier."""
    mock_session = MagicMock()
    mock_session.id = "cs_test_session_123"
    mock_session.url = "https://checkout.stripe.com/c/pay/cs_test_session_123"

    with patch("stripe.checkout.Session.create", return_value=mock_session) as mock_create:
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "success_url": "http://localhost:5173/billing/success?session_id={CHECKOUT_SESSION_ID}",
                "cancel_url": "http://localhost:5173/billing/cancelled",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "cs_test_session_123"
        assert data["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_session_123"

        # Verify Stripe API was called with expected billing parameters
        mock_create.assert_called_once()
        _, kwargs = mock_create.call_args
        assert kwargs["mode"] == "subscription"
        assert kwargs["client_reference_id"] == TEST_USER_ID
        assert kwargs["customer_email"] == TEST_USER_EMAIL
        assert kwargs["line_items"][0]["price_data"]["unit_amount"] == 2900
        assert kwargs["line_items"][0]["price_data"]["currency"] == "usd"


def test_checkout_session_missing_stripe_key(client: TestClient):
    """Test 503 is raised if STRIPE_SECRET_KEY is not configured on server."""
    settings.STRIPE_SECRET_KEY = ""
    response = client.post("/api/v1/billing/checkout", json={})
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_billing_status_free_user(client: TestClient, db_session: Session):
    """Test billing status endpoint returns free tier details for new user."""
    response = client.get("/api/v1/billing/status")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == TEST_USER_ID
    assert data["tier"] == "free"
    assert data["is_pro"] is False
    assert data["stripe_customer_id"] is None
    assert data["stripe_subscription_id"] is None


def test_billing_status_pro_user(client: TestClient, db_session: Session):
    """Test billing status endpoint returns pro tier and stripe identifiers."""
    profile = UserProfile(
        user_id=TEST_USER_ID,
        tier="pro",
        stripe_customer_id="cus_pro_test_999",
        stripe_subscription_id="sub_pro_test_999",
    )
    db_session.add(profile)
    db_session.commit()

    response = client.get("/api/v1/billing/status")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == TEST_USER_ID
    assert data["tier"] == "pro"
    assert data["is_pro"] is True
    assert data["stripe_customer_id"] == "cus_pro_test_999"
    assert data["stripe_subscription_id"] == "sub_pro_test_999"


def test_customer_portal_success(client: TestClient, db_session: Session):
    """Test customer portal creation for user with existing Stripe customer record."""
    profile = UserProfile(
        user_id=TEST_USER_ID,
        tier="pro",
        stripe_customer_id="cus_portal_test_123",
    )
    db_session.add(profile)
    db_session.commit()

    mock_portal = MagicMock()
    mock_portal.url = "https://billing.stripe.com/p/session_portal_123"

    with patch("stripe.billing_portal.Session.create", return_value=mock_portal) as mock_create:
        response = client.post(
            "/api/v1/billing/portal",
            json={"return_url": "http://localhost:5173/"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["portal_url"] == "https://billing.stripe.com/p/session_portal_123"

        mock_create.assert_called_once()
        _, kwargs = mock_create.call_args
        assert kwargs["customer"] == "cus_portal_test_123"


def test_customer_portal_without_customer_id(client: TestClient, db_session: Session):
    """Test portal returns 400 when user has never initiated a Stripe payment."""
    profile = UserProfile(user_id=TEST_USER_ID, tier="free", stripe_customer_id=None)
    db_session.add(profile)
    db_session.commit()

    response = client.post("/api/v1/billing/portal", json={})
    assert response.status_code == 400
    assert "No Stripe customer record found" in response.json()["detail"]


def test_webhook_missing_signature_header(client: TestClient):
    """Test webhook rejects requests without Stripe-Signature header."""
    response = client.post("/api/v1/billing/webhook", content=b"{}")
    assert response.status_code == 400
    assert "Missing Stripe-Signature header" in response.json()["detail"]


def test_webhook_missing_secret_config(client: TestClient):
    """Test webhook returns 503 when STRIPE_WEBHOOK_SECRET is not configured."""
    settings.STRIPE_WEBHOOK_SECRET = ""
    response = client.post(
        "/api/v1/billing/webhook",
        headers={"stripe-signature": "t=123,v1=sig"},
        content=b"{}",
    )
    assert response.status_code == 503
    assert "webhook secret is not configured" in response.json()["detail"]


def test_webhook_invalid_signature(client: TestClient):
    """Test webhook fails with 400 if Stripe signature validation fails."""
    with patch(
        "stripe.Webhook.construct_event",
        side_effect=stripe.error.SignatureVerificationError("Invalid sig", "sig_header"),
    ):
        response = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "bad_sig"},
            content=b"{}",
        )
        assert response.status_code == 400
        assert "Invalid Stripe webhook signature" in response.json()["detail"]


def test_webhook_checkout_session_completed_upgrades_user(client: TestClient, db_session: Session):
    """Test checkout.session.completed webhook event upgrades free user to pro and saves customer/subscription IDs."""
    # Seed initial free user profile
    profile = UserProfile(user_id=TEST_USER_ID, tier="free")
    db_session.add(profile)
    db_session.commit()

    mock_event = {
        "id": "evt_checkout_completed_123",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_session_abc",
                "client_reference_id": TEST_USER_ID,
                "customer": "cus_stripe_111",
                "subscription": "sub_stripe_222",
                "metadata": {"user_id": TEST_USER_ID},
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=mock_event):
        response = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_signature"},
            content=b'{"mock": "payload"}',
        )

        assert response.status_code == 200
        data = response.json()
        assert data["received"] is True
        assert data["event_type"] == "checkout.session.completed"
        assert data["status"] == "upgraded"

    # Verify user profile in database has been updated
    updated_profile = db_session.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
    assert updated_profile is not None
    assert updated_profile.tier == "pro"
    assert updated_profile.stripe_customer_id == "cus_stripe_111"
    assert updated_profile.stripe_subscription_id == "sub_stripe_222"


def test_webhook_subscription_deleted_downgrades_user(client: TestClient, db_session: Session):
    """Test customer.subscription.deleted event reverts active Pro user back to Free tier."""
    profile = UserProfile(
        user_id=TEST_USER_ID,
        tier="pro",
        stripe_customer_id="cus_stripe_111",
        stripe_subscription_id="sub_stripe_222",
    )
    db_session.add(profile)
    db_session.commit()

    mock_event = {
        "id": "evt_sub_deleted_123",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_stripe_222",
                "customer": "cus_stripe_111",
                "metadata": {"user_id": TEST_USER_ID},
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=mock_event):
        response = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_signature"},
            content=b'{"mock": "payload"}',
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "downgraded"

    # Verify user profile is now free and subscription id cleared
    updated_profile = db_session.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
    assert updated_profile.tier == "free"
    assert updated_profile.stripe_subscription_id is None


def test_webhook_subscription_updated_active_and_canceled(client: TestClient, db_session: Session):
    """Test customer.subscription.updated handles status transitions."""
    profile = UserProfile(
        user_id=TEST_USER_ID,
        tier="pro",
        stripe_subscription_id="sub_stripe_333",
    )
    db_session.add(profile)
    db_session.commit()

    # Transition to canceled
    cancel_event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_stripe_333",
                "status": "canceled",
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=cancel_event):
        res = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_sig"},
            content=b"{}",
        )
        assert res.status_code == 200
        assert res.json()["status"] == "updated"

    updated = db_session.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
    assert updated.tier == "free"


def test_webhook_unhandled_event_type(client: TestClient):
    """Test unhandled events return status='ignored' without failing."""
    mock_event = {
        "type": "charge.captured",
        "data": {"object": {"id": "ch_123"}},
    }
    with patch("stripe.Webhook.construct_event", return_value=mock_event):
        res = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_sig"},
            content=b"{}",
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ignored"


def test_webhook_with_stripe_event_object_checkout_completed(client: TestClient, db_session: Session):
    """Test webhook with genuine stripe.Event and StripeObject instances (no dict .get method)."""
    profile = UserProfile(user_id=TEST_USER_ID, tier="free")
    db_session.add(profile)
    db_session.commit()

    stripe_event_instance = stripe.Event.construct_from(
        {
            "id": "evt_real_stripe_event_123",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_stripe_sdk_obj_999",
                    "client_reference_id": TEST_USER_ID,
                    "customer": "cus_sdk_test_999",
                    "subscription": "sub_sdk_test_999",
                    "metadata": {"user_id": TEST_USER_ID},
                }
            },
        },
        None,
    )

    with patch("stripe.Webhook.construct_event", return_value=stripe_event_instance):
        response = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_signature"},
            content=b'{"mock": "payload"}',
        )

        assert response.status_code == 200
        data = response.json()
        assert data["received"] is True
        assert data["event_type"] == "checkout.session.completed"
        assert data["status"] == "upgraded"

    updated_profile = db_session.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
    assert updated_profile is not None
    assert updated_profile.tier == "pro"
    assert updated_profile.stripe_customer_id == "cus_sdk_test_999"
    assert updated_profile.stripe_subscription_id == "sub_sdk_test_999"


def test_webhook_with_stripe_event_object_subscription_deleted(client: TestClient, db_session: Session):
    """Test customer.subscription.deleted with stripe.Event object."""
    profile = UserProfile(
        user_id=TEST_USER_ID,
        tier="pro",
        stripe_customer_id="cus_sdk_test_999",
        stripe_subscription_id="sub_sdk_test_999",
    )
    db_session.add(profile)
    db_session.commit()

    stripe_event_instance = stripe.Event.construct_from(
        {
            "id": "evt_real_sub_deleted_123",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": "sub_sdk_test_999",
                    "customer": "cus_sdk_test_999",
                    "metadata": {"user_id": TEST_USER_ID},
                }
            },
        },
        None,
    )

    with patch("stripe.Webhook.construct_event", return_value=stripe_event_instance):
        response = client.post(
            "/api/v1/billing/webhook",
            headers={"stripe-signature": "valid_signature"},
            content=b'{"mock": "payload"}',
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "downgraded"

    updated_profile = db_session.query(UserProfile).filter(UserProfile.user_id == TEST_USER_ID).first()
    assert updated_profile.tier == "free"
    assert updated_profile.stripe_subscription_id is None


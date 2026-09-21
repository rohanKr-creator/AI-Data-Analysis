import logging
from typing import Any, Dict, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
import stripe

from app.core.config import settings
from app.models.user_profile import UserProfile
from app.services.usage_service import usage_service

logger = logging.getLogger(__name__)


class StripeService:
    """Service handling Stripe checkout session creation, webhook verification, and event parsing."""

    def __init__(self) -> None:
        if settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY

    def create_checkout_session(
        self,
        user_id: str,
        user_email: Optional[str] = None,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> stripe.checkout.Session:
        """
        Create a Stripe Checkout Session for a $29/month Pro subscription.

        Args:
            user_id: Supabase authenticated user ID attached to session metadata.
            user_email: Optional user email address to pre-fill customer email in checkout.
            success_url: Optional custom redirect URL on successful checkout completion.
            cancel_url: Optional custom redirect URL when user abandons checkout.

        Returns:
            Created Stripe Checkout Session object.
        """
        if not settings.STRIPE_SECRET_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe payments are not configured. Please set STRIPE_SECRET_KEY in environment.",
            )

        stripe.api_key = settings.STRIPE_SECRET_KEY

        base_frontend = settings.FRONTEND_URL.rstrip("/")
        final_success_url = (
            success_url
            if success_url
            else f"{base_frontend}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
        )
        final_cancel_url = (
            cancel_url if cancel_url else f"{base_frontend}/billing/cancelled"
        )

        session_params: Dict[str, Any] = {
            "mode": "subscription",
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": "AI Data Analyst Pro Plan",
                            "description": "Unlimited dataset uploads, unlimited Gemini AI questions, and priority performance.",
                        },
                        "unit_amount": 2900,  # $29.00 USD
                        "recurring": {
                            "interval": "month",
                        },
                    },
                    "quantity": 1,
                }
            ],
            "client_reference_id": user_id,
            "metadata": {
                "user_id": user_id,
            },
            "subscription_data": {
                "metadata": {
                    "user_id": user_id,
                }
            },
            "success_url": final_success_url,
            "cancel_url": final_cancel_url,
        }

        if user_email:
            session_params["customer_email"] = user_email

        try:
            session = stripe.checkout.Session.create(**session_params)
            return session
        except stripe.error.StripeError as exc:
            logger.error("Failed to create Stripe checkout session: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Stripe checkout session creation failed: {exc.user_message or str(exc)}",
            ) from exc

    def create_customer_portal_session(
        self,
        customer_id: str,
        return_url: Optional[str] = None,
    ) -> stripe.billing_portal.Session:
        """Create a Stripe Customer Billing Portal Session for managing subscriptions."""
        if not settings.STRIPE_SECRET_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe payments are not configured. Please set STRIPE_SECRET_KEY in environment.",
            )

        stripe.api_key = settings.STRIPE_SECRET_KEY
        base_frontend = settings.FRONTEND_URL.rstrip("/")
        final_return_url = return_url if return_url else f"{base_frontend}/"

        try:
            portal_session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=final_return_url,
            )
            return portal_session
        except stripe.error.StripeError as exc:
            logger.error("Failed to create customer portal session: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Customer portal session creation failed: {exc.user_message or str(exc)}",
            ) from exc

    def construct_webhook_event(
        self,
        payload: bytes,
        sig_header: Optional[str],
    ) -> stripe.Event:
        """
        Verify the Stripe-Signature header using the configured webhook signing secret
        and construct the verified Stripe Event object.

        Signature verification is critical for webhook endpoints:
        Because Stripe webhooks are public HTTP endpoints without user authentication,
        verifying the cryptographic HMAC-SHA256 signature guarantees that:
        1. The payload originated exclusively from Stripe and not an attacker.
        2. The event data was not tampered with or modified in transit.
        3. Stale or replayed webhook requests are rejected via timestamp validation.
        """
        if not settings.STRIPE_WEBHOOK_SECRET:
            logger.error("STRIPE_WEBHOOK_SECRET is not configured.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe webhook secret is not configured on server.",
            )

        if not sig_header:
            logger.warning("Webhook request missing Stripe-Signature header.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Stripe-Signature header.",
            )

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
            return event
        except ValueError as val_err:
            logger.warning("Invalid webhook payload format: %s", val_err)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook payload format.",
            ) from val_err
        except stripe.error.SignatureVerificationError as sig_err:
            logger.warning("Invalid Stripe webhook signature: %s", sig_err)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Stripe webhook signature.",
            ) from sig_err

    def handle_webhook_event(
        self,
        event: Any,
        db: Session,
    ) -> Dict[str, Any]:
        """Dispatch verified Stripe event to the appropriate business logic handler."""
        # The Stripe SDK returns a stripe.Event object where .get() is not supported.
        # We access event.type (or fallback to event.get('type') for dict mocks),
        # and convert the event / data object to dict for safe attribute traversal.
        event_type = getattr(event, "type", None) or (
            event.get("type", "") if isinstance(event, dict) else ""
        )

        event_dict = (
            event.to_dict()
            if hasattr(event, "to_dict")
            else (event if isinstance(event, dict) else {})
        )
        data_object = event_dict.get("data", {}).get("object", {})

        logger.info("Processing Stripe webhook event: %s", event_type)

        if event_type == "checkout.session.completed":
            return self._handle_checkout_session_completed(data_object, db)
        elif event_type == "customer.subscription.deleted":
            return self._handle_subscription_deleted(data_object, db)
        elif event_type == "customer.subscription.updated":
            return self._handle_subscription_updated(data_object, db)
        elif event_type == "invoice.payment_failed":
            return self._handle_payment_failed(data_object, db)
        else:
            logger.info("Unhandled Stripe webhook event type: %s", event_type)
            return {"status": "ignored", "event_type": event_type}

    def _handle_checkout_session_completed(
        self,
        session_obj: Any,
        db: Session,
    ) -> Dict[str, Any]:
        """Handle checkout.session.completed: activate Pro tier for the user."""
        session_data: Dict[str, Any] = (
            session_obj.to_dict()
            if hasattr(session_obj, "to_dict")
            else (session_obj if isinstance(session_obj, dict) else {})
        )
        user_id = (
            session_data.get("client_reference_id")
            or session_data.get("metadata", {}).get("user_id")
        )
        if not user_id:
            logger.warning("Checkout session %s missing user_id reference.", session_data.get("id"))
            return {"status": "skipped", "reason": "missing_user_id"}

        customer_id = session_data.get("customer")
        subscription_id = session_data.get("subscription")

        profile = usage_service.get_or_create_profile(db, user_id)
        profile.tier = "pro"
        if customer_id:
            profile.stripe_customer_id = str(customer_id)
        if subscription_id:
            profile.stripe_subscription_id = str(subscription_id)

        db.commit()
        db.refresh(profile)
        logger.info("User %s successfully upgraded to Pro via session %s.", user_id, session_data.get("id"))
        return {
            "status": "upgraded",
            "user_id": user_id,
            "tier": "pro",
            "stripe_customer_id": profile.stripe_customer_id,
            "stripe_subscription_id": profile.stripe_subscription_id,
        }

    def _handle_subscription_deleted(
        self,
        subscription_obj: Any,
        db: Session,
    ) -> Dict[str, Any]:
        """Handle customer.subscription.deleted: revert user to free tier."""
        subscription_data: Dict[str, Any] = (
            subscription_obj.to_dict()
            if hasattr(subscription_obj, "to_dict")
            else (subscription_obj if isinstance(subscription_obj, dict) else {})
        )
        subscription_id = subscription_data.get("id")
        customer_id = subscription_data.get("customer")
        user_id = subscription_data.get("metadata", {}).get("user_id")

        query = db.query(UserProfile)
        profile = None
        if subscription_id:
            profile = query.filter(UserProfile.stripe_subscription_id == subscription_id).first()
        if not profile and user_id:
            profile = query.filter(UserProfile.user_id == user_id).first()
        if not profile and customer_id:
            profile = query.filter(UserProfile.stripe_customer_id == customer_id).first()

        if profile:
            profile.tier = "free"
            profile.stripe_subscription_id = None
            db.commit()
            db.refresh(profile)
            logger.info("User %s subscription ended; reverted to free tier.", profile.user_id)
            return {"status": "downgraded", "user_id": profile.user_id, "tier": "free"}

        logger.warning("Could not locate user profile for deleted subscription %s", subscription_id)
        return {"status": "not_found", "subscription_id": subscription_id}

    def _handle_subscription_updated(
        self,
        subscription_obj: Any,
        db: Session,
    ) -> Dict[str, Any]:
        """Handle customer.subscription.updated: sync status changes."""
        subscription_data: Dict[str, Any] = (
            subscription_obj.to_dict()
            if hasattr(subscription_obj, "to_dict")
            else (subscription_obj if isinstance(subscription_obj, dict) else {})
        )
        subscription_id = subscription_data.get("id")
        sub_status = subscription_data.get("status")
        customer_id = subscription_data.get("customer")
        user_id = subscription_data.get("metadata", {}).get("user_id")

        query = db.query(UserProfile)
        profile = None
        if subscription_id:
            profile = query.filter(UserProfile.stripe_subscription_id == subscription_id).first()
        if not profile and user_id:
            profile = query.filter(UserProfile.user_id == user_id).first()
        if not profile and customer_id:
            profile = query.filter(UserProfile.stripe_customer_id == customer_id).first()

        if not profile:
            return {"status": "not_found", "subscription_id": subscription_id}

        if sub_status in {"active", "trialing"}:
            profile.tier = "pro"
        elif sub_status in {"canceled", "unpaid", "incomplete_expired"}:
            profile.tier = "free"

        db.commit()
        db.refresh(profile)
        return {"status": "updated", "user_id": profile.user_id, "tier": profile.tier}

    def _handle_payment_failed(
        self,
        invoice_obj: Any,
        db: Session,
    ) -> Dict[str, Any]:
        """Handle invoice.payment_failed."""
        invoice_data: Dict[str, Any] = (
            invoice_obj.to_dict()
            if hasattr(invoice_obj, "to_dict")
            else (invoice_obj if isinstance(invoice_obj, dict) else {})
        )
        customer_id = invoice_data.get("customer")
        logger.warning("Invoice payment failed for customer: %s", customer_id)
        return {"status": "payment_failed", "customer_id": customer_id}


stripe_service = StripeService()

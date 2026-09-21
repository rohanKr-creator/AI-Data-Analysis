from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.schemas.billing import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalRequest,
    PortalResponse,
    WebhookResponse,
)
from app.services.stripe_service import stripe_service
from app.services.usage_service import usage_service

router = APIRouter()


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Create Stripe Checkout Session",
    description="Generates a Stripe Checkout Session URL for the authenticated user to subscribe to Pro tier ($29/month).",
)
def create_checkout(
    request_body: Optional[CheckoutRequest] = None,
    user: AuthenticatedUser = Depends(get_current_user),
) -> CheckoutResponse:
    """Initiate a Stripe Checkout session for upgrading to Pro tier."""
    success_url = request_body.success_url if request_body else None
    cancel_url = request_body.cancel_url if request_body else None

    session = stripe_service.create_checkout_session(
        user_id=user.id,
        user_email=user.email,
        success_url=success_url,
        cancel_url=cancel_url,
    )

    return CheckoutResponse(
        checkout_url=session.url,
        session_id=session.id,
    )


@router.post(
    "/portal",
    response_model=PortalResponse,
    status_code=status.HTTP_200_OK,
    summary="Create Stripe Customer Billing Portal Session",
    description="Creates a Stripe Customer Portal session where users can manage payment methods, download invoices, or cancel their subscription.",
)
def create_billing_portal(
    request_body: Optional[PortalRequest] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> PortalResponse:
    """Generate a redirect URL for the Stripe Customer Billing Portal."""
    profile = usage_service.get_or_create_profile(db, user.id)
    if not profile.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Stripe customer record found for this account. You must subscribe to Pro first.",
        )

    return_url = request_body.return_url if request_body else None
    portal_session = stripe_service.create_customer_portal_session(
        customer_id=profile.stripe_customer_id,
        return_url=return_url,
    )

    return PortalResponse(portal_url=portal_session.url)


@router.get(
    "/status",
    response_model=BillingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get User Billing Status",
    description="Returns current user's subscription tier and Stripe customer/subscription identifiers.",
)
def get_billing_status(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> BillingStatusResponse:
    """Return user's active billing status and associated Stripe IDs."""
    profile = usage_service.get_or_create_profile(db, user.id)
    return BillingStatusResponse(
        user_id=user.id,
        tier=profile.tier,
        is_pro=(profile.tier == "pro"),
        stripe_customer_id=profile.stripe_customer_id,
        stripe_subscription_id=profile.stripe_subscription_id,
    )


@router.post(
    "/webhook",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    summary="Stripe Webhook Handler",
    description="Receives and cryptographically verifies asynchronous webhook events from Stripe (checkout.session.completed, customer.subscription.deleted, etc.).",
)
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> WebhookResponse:
    """Public webhook listener verifying HMAC signature and processing Stripe lifecycle events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    event = stripe_service.construct_webhook_event(
        payload=payload,
        sig_header=sig_header,
    )

    result = stripe_service.handle_webhook_event(event=event, db=db)

    event_type = getattr(event, "type", None) or (
        event.get("type", "unknown") if isinstance(event, dict) else "unknown"
    )

    return WebhookResponse(
        received=True,
        event_type=event_type,
        status=result.get("status", "processed"),
    )

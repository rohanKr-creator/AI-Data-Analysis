from typing import Optional
from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    """Request model for initiating a Stripe Checkout session."""

    success_url: Optional[str] = Field(
        default=None,
        description="Custom redirect URL on successful checkout completion.",
    )
    cancel_url: Optional[str] = Field(
        default=None,
        description="Custom redirect URL when user cancels checkout.",
    )


class CheckoutResponse(BaseModel):
    """Response model returning the Stripe Checkout URL and session ID."""

    checkout_url: str = Field(description="Hosted Stripe Checkout URL to redirect the user to")
    session_id: str = Field(description="Stripe Checkout session ID")


class PortalRequest(BaseModel):
    """Request model for creating a Stripe Customer Billing Portal session."""

    return_url: Optional[str] = Field(
        default=None,
        description="Custom redirect URL when user exits the customer billing portal.",
    )


class PortalResponse(BaseModel):
    """Response model returning the hosted Stripe Customer Portal URL."""

    portal_url: str = Field(description="Hosted Stripe Customer Portal URL")


class BillingStatusResponse(BaseModel):
    """Response model returning user's active billing status and subscription info."""

    user_id: str = Field(description="Supabase authenticated user ID")
    tier: str = Field(description="Current subscription tier ('free' or 'pro')")
    is_pro: bool = Field(description="Boolean convenience flag if user has active Pro access")
    stripe_customer_id: Optional[str] = Field(
        default=None,
        description="Stripe customer ID if user has ever initiated checkout",
    )
    stripe_subscription_id: Optional[str] = Field(
        default=None,
        description="Active Stripe subscription ID",
    )


class WebhookResponse(BaseModel):
    """Response returned upon processing a verified Stripe webhook."""

    received: bool = Field(default=True, description="Acknowledgment of webhook receipt")
    event_type: str = Field(description="Processed Stripe event type")
    status: str = Field(description="Processing outcome status ('upgraded', 'downgraded', 'ignored', etc.)")

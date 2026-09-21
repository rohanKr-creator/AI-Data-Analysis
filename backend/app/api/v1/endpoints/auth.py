from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.services.usage_service import usage_service

router = APIRouter()


class UserProfileResponse(BaseModel):
    """Response model for the authenticated user."""

    user_id: str = Field(description="Unique user ID from Supabase Auth (sub claim)")
    email: Optional[str] = Field(default=None, description="User email address")
    role: Optional[str] = Field(default=None, description="Authentication role")
    tier: str = Field(default="free", description="User subscription tier (free or pro)")
    stripe_customer_id: Optional[str] = Field(default=None, description="Stripe customer ID")
    stripe_subscription_id: Optional[str] = Field(default=None, description="Stripe subscription ID")
    app_metadata: Dict[str, Any] = Field(default_factory=dict, description="Application metadata")
    user_metadata: Dict[str, Any] = Field(default_factory=dict, description="User metadata")


class UsageMetric(BaseModel):
    """Usage counts and limits for a single metered event type."""

    used: int = Field(description="Number of events consumed today")
    limit: Optional[int] = Field(default=None, description="Daily limit, or null if unlimited")
    remaining: Optional[int] = Field(default=None, description="Remaining events today, or null if unlimited")
    unlimited: bool = Field(description="Whether the user has unlimited access")
    display_name: str = Field(description="Human-readable event name")


class UserUsageResponse(BaseModel):
    """Response model for user tier limits and daily usage metrics."""

    user_id: str = Field(description="Unique user ID from Supabase Auth")
    tier: str = Field(description="Current subscription tier ('free' or 'pro')")
    usage: Dict[str, UsageMetric] = Field(description="Dictionary of usage metrics by event type")


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user details",
    description="Validates Bearer token, provisions free profile if new, and returns user details.",
)
def get_current_user_profile(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> UserProfileResponse:
    """Return the profile of the verified Supabase user, auto-creating a free tier profile if new."""
    profile = usage_service.get_or_create_profile(db, user.id)
    return UserProfileResponse(
        user_id=user.id,
        email=user.email,
        role=user.role,
        tier=profile.tier,
        stripe_customer_id=profile.stripe_customer_id,
        stripe_subscription_id=profile.stripe_subscription_id,
        app_metadata=user.app_metadata,
        user_metadata=user.user_metadata,
    )


@router.get(
    "/usage",
    response_model=UserUsageResponse,
    summary="Get user usage and limits",
    description="Returns current user's subscription tier, limits, and today's usage counts.",
)
def get_current_user_usage(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> UserUsageResponse:
    """Return user's tier and today's metered usage counts vs limits."""
    summary = usage_service.get_usage_summary(db, user.id)
    return UserUsageResponse(**summary)

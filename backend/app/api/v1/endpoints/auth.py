from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.core.auth import AuthenticatedUser, get_current_user

router = APIRouter()


class UserProfileResponse(BaseModel):
    """Response model for the authenticated user."""

    user_id: str = Field(description="Unique user ID from Supabase Auth (sub claim)")
    email: Optional[str] = Field(default=None, description="User email address")
    role: Optional[str] = Field(default=None, description="Authentication role")
    app_metadata: Dict[str, Any] = Field(default_factory=dict, description="Application metadata")
    user_metadata: Dict[str, Any] = Field(default_factory=dict, description="User metadata")


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user details",
    description="Validates the Bearer token against Supabase Auth and returns the authenticated user profile.",
)
def get_current_user_profile(
    user: AuthenticatedUser = Depends(get_current_user),
) -> UserProfileResponse:
    """Return the profile of the verified Supabase user."""
    return UserProfileResponse(
        user_id=user.id,
        email=user.email,
        role=user.role,
        app_metadata=user.app_metadata,
        user_metadata=user.user_metadata,
    )

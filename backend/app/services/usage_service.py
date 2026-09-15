from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user_profile import UsageEvent, UserProfile

# Daily limits by tier (None denotes unlimited access)
TIER_LIMITS: Dict[str, Dict[str, Optional[int]]] = {
    "free": {
        "upload": 5,
        "ask": 20,
    },
    "pro": {
        "upload": None,
        "ask": None,
    },
}

EVENT_DISPLAY_NAMES: Dict[str, str] = {
    "upload": "uploads",
    "ask": "questions",
}


def get_today_utc_start() -> datetime:
    """Return the start of the current day in UTC (00:00:00.000000)."""
    return datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


class UsageService:
    """Service handling user profile tiers, metered usage tracking, and quota limits."""

    def get_or_create_profile(self, db: Session, user_id: str) -> UserProfile:
        """Fetch user profile or initialize with 'free' tier if first authenticated access."""
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile:
            return profile

        try:
            profile = UserProfile(user_id=user_id, tier="free")
            db.add(profile)
            db.commit()
            db.refresh(profile)
            return profile
        except IntegrityError:
            # Handle potential race condition if another thread inserted concurrently
            db.rollback()
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            if profile:
                return profile
            raise

    def get_today_usage_count(self, db: Session, user_id: str, event_type: str) -> int:
        """Count how many times user has triggered event_type since UTC midnight."""
        today_start = get_today_utc_start()
        count = (
            db.query(func.count(UsageEvent.id))
            .filter(
                UsageEvent.user_id == user_id,
                UsageEvent.event_type == event_type,
                UsageEvent.created_at >= today_start,
            )
            .scalar()
        )
        return int(count or 0)

    def check_quota(self, db: Session, user_id: str, event_type: str) -> UserProfile:
        """
        Verify if the user is allowed to perform event_type.
        Raises HTTP 429 Too Many Requests if daily quota for their tier is exhausted.
        """
        profile = self.get_or_create_profile(db, user_id)

        # Pro tier bypasses all daily limits
        if profile.tier == "pro":
            return profile

        tier_rules = TIER_LIMITS.get(profile.tier, TIER_LIMITS["free"])
        daily_limit = tier_rules.get(event_type)

        if daily_limit is not None:
            current_used = self.get_today_usage_count(db, user_id, event_type)
            if current_used >= daily_limit:
                display_name = EVENT_DISPLAY_NAMES.get(event_type, f"{event_type} requests")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Free tier limit reached: {daily_limit} {display_name} per day. "
                        "Upgrade to Pro for unlimited access."
                    ),
                )

        return profile

    def record_usage(self, db: Session, user_id: str, event_type: str) -> UsageEvent:
        """Log a completed billable/metered event for the user."""
        event = UsageEvent(user_id=user_id, event_type=event_type)
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    def get_usage_summary(self, db: Session, user_id: str) -> Dict[str, Any]:
        """Return full usage dashboard payload comparing used vs limits for the user."""
        profile = self.get_or_create_profile(db, user_id)
        tier = profile.tier
        tier_rules = TIER_LIMITS.get(tier, TIER_LIMITS["free"])

        usage_details: Dict[str, Dict[str, Any]] = {}
        for event_key in ["upload", "ask"]:
            daily_limit = tier_rules.get(event_key)
            used = self.get_today_usage_count(db, user_id, event_key)
            remaining = (
                max(0, daily_limit - used) if daily_limit is not None else None
            )
            usage_details[event_key] = {
                "used": used,
                "limit": daily_limit,
                "remaining": remaining,
                "unlimited": daily_limit is None,
                "display_name": EVENT_DISPLAY_NAMES.get(event_key, event_key),
            }

        return {
            "user_id": user_id,
            "tier": tier,
            "usage": usage_details,
        }


usage_service = UsageService()

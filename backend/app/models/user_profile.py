from typing import Optional
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class UserProfile(Base):
    """SQLAlchemy model representing a user's subscription profile and usage tier."""

    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(
        String(255),
        primary_key=True,
        index=True,
        doc="Supabase authenticated user ID (UUID string from auth.users)",
    )
    tier: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="free",
        server_default="free",
        doc="Subscription tier: 'free' or 'pro'",
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        doc="Stripe Customer ID linked to this user",
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
        doc="Stripe Subscription ID for recurring billing",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="UTC timestamp when the user profile was initialized",
    )


class UsageEvent(Base):
    """SQLAlchemy model logging metered usage events (uploads, AI questions)."""

    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        doc="Unique identifier (UUID) for this usage event",
    )
    user_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
        doc="Supabase user ID who performed the metered action",
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Type of action consumed: 'upload' or 'ask'",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
        doc="UTC timestamp when the action was recorded",
    )

    __table_args__ = (
        Index("ix_usage_events_user_event_created", "user_id", "event_type", "created_at"),
    )

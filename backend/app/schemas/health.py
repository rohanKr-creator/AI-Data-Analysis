from datetime import datetime, timezone
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Schema for application health check response."""

    status: str = Field(default="ok", description="Current operational status of the service")
    environment: str = Field(description="Runtime environment name (e.g., development, production)")
    version: str = Field(description="Current version of the application")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when the health check was performed",
    )

from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class DatasetUploadResponse(BaseModel):
    """Response returned upon successful dataset upload."""

    dataset_id: str = Field(description="Unique identifier assigned to the uploaded dataset")
    filename: str = Field(description="Sanitized original filename")
    size_bytes: int = Field(description="Total file size in bytes")
    content_type: str = Field(description="MIME type of the uploaded file")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the upload",
    )
    message: str = Field(default="Dataset uploaded and validated successfully")


class DatasetErrorResponse(BaseModel):
    """Error schema for dataset validation failures."""

    detail: str = Field(description="Description of the error encountered")

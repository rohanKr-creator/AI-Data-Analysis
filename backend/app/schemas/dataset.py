from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
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


class ColumnSummary(BaseModel):
    """Summary of a single column's data type and null statistics."""

    name: str = Field(description="Column name")
    data_type: str = Field(description="Inferred data type (e.g. integer, float, string, boolean, datetime)")
    null_count: int = Field(description="Number of missing or null values in this column")
    null_percentage: float = Field(description="Percentage of null values in this column (0.0 to 100.0)")


class NumericColumnStats(BaseModel):
    """Statistical summary for numeric columns."""

    mean: Optional[float] = Field(None, description="Arithmetic mean of values")
    std: Optional[float] = Field(None, description="Sample standard deviation")
    min: Optional[float] = Field(None, description="Minimum value")
    max: Optional[float] = Field(None, description="Maximum value")


class DatasetProfileResponse(BaseModel):
    """Comprehensive dataset profiling analysis response."""

    dataset_id: str = Field(description="Unique identifier of the dataset")
    filename: str = Field(description="Original filename of the dataset")
    row_count: int = Field(description="Total number of rows in the dataset")
    column_count: int = Field(description="Total number of columns in the dataset")
    columns: List[ColumnSummary] = Field(description="Per-column inferred types and missing value counts")
    numeric_summary: Dict[str, NumericColumnStats] = Field(
        default_factory=dict,
        description="Basic summary statistics (mean, std, min, max) for numeric columns",
    )
    preview: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="First 5 rows of the dataset as key-value dictionaries",
    )


class DatasetErrorResponse(BaseModel):
    """Error schema for dataset failures."""

    detail: str = Field(description="Description of the error encountered")

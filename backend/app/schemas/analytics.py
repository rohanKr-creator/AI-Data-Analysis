from typing import Any, List, Optional
from pydantic import BaseModel, Field


class AnalyticsRequest(BaseModel):
    """Request schema for running analytical operations on a dataset."""

    column: str = Field(
        ...,
        description="The primary column to analyze",
        examples=["salary"],
    )
    operation: str = Field(
        ...,
        description="Analytical operation: mean, sum, min, max, count, median, std, or value_counts",
        examples=["mean"],
    )
    group_by: Optional[str] = Field(
        default=None,
        description="Optional column to group results by",
        examples=["department"],
    )


class AnalyticsResponse(BaseModel):
    """Response schema returned after running analytical operations."""

    dataset_id: str = Field(description="Unique identifier of the analyzed dataset")
    operation: str = Field(description="The analytical operation performed")
    column: str = Field(description="The primary column analyzed")
    group_by: Optional[str] = Field(default=None, description="Grouping column used, if specified")
    columns: List[str] = Field(description="List of all columns involved in this calculation")
    result: Any = Field(description="Computed result (scalar, dictionary, or grouped mapping)")
    row_count: int = Field(description="Number of data rows on which the calculation was performed")
    message: str = Field(
        default="Operation executed successfully.",
        description="Status description of the analytical calculation",
    )

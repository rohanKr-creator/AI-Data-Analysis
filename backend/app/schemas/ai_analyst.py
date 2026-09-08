from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class AskQuestionRequest(BaseModel):
    """Request schema for asking a natural-language question about a dataset."""

    question: str = Field(
        ...,
        min_length=1,
        description="The natural language question to ask about the dataset",
        examples=["What is the average salary by department?"],
    )


class AnalystIntent(BaseModel):
    """Structured intent interpreted by Gemini from the user's natural language question."""

    can_answer: bool = Field(
        description="True if the question can be answered using supported operations on dataset columns, false otherwise."
    )
    operation: Optional[
        Literal[
            "mean",
            "sum",
            "min",
            "max",
            "count",
            "median",
            "std",
            "value_counts",
        ]
    ] = Field(
        default=None,
        description="Deterministic analytical operation to execute: mean, sum, min, max, count, median, std, or value_counts.",
    )
    column: Optional[str] = Field(
        default=None,
        description="Exact name of the target dataset column to analyze.",
    )
    group_by: Optional[str] = Field(
        default=None,
        description="Optional exact name of the column to group results by.",
    )
    reason: Optional[str] = Field(
        default=None,
        description="Reason why the question cannot be answered or clarification of intent.",
    )


class AskQuestionResponse(BaseModel):
    """Response schema returned by the AI Analyst endpoint."""

    question: str = Field(
        description="The original natural language question asked by the user."
    )
    operation_used: Optional[str] = Field(
        default=None,
        description="The deterministic operation executed by Pandas (e.g. mean, sum), or None if unanswerable.",
    )
    column_used: Optional[str] = Field(
        default=None,
        description="The dataset column analyzed, or None if unanswerable.",
    )
    group_by: Optional[str] = Field(
        default=None,
        description="The group_by column used for category breakdown, if applicable.",
    )
    result: Optional[Any] = Field(
        default=None,
        description="The real, deterministic numerical or aggregate result computed by Pandas.",
    )
    answer: str = Field(
        description="Natural-language sentence explaining the verified computed result to the user.",
    )
    row_count: Optional[int] = Field(
        default=None,
        description="Number of dataset rows involved in the calculation, or None.",
    )

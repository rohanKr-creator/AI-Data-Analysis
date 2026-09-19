import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union
import httpx
import pandas as pd
from fastapi import HTTPException, status
from google import genai
from google.genai import errors

from app.core.config import settings
from app.schemas.ai_analyst import AnalystIntent, AskQuestionResponse
from app.schemas.analytics import AnalyticsRequest
from app.services.analytics_service import (
    AnalyticsValidationError,
    analytics_service,
)
from app.services.dataset_service import DatasetNotFoundError, dataset_service
from app.services.file_validator import read_file_to_dataframe
from app.services.profiling_service import profiling_service
from app.services.storage_service import storage_service, StorageFileNotFoundError

logger = logging.getLogger(__name__)


class AiAnalystService:
    """
    AI Analyst Service that orchestrates the natural-language question flow:
    1. Sends user question + column schema to Gemini to decide WHICH deterministic operation to run.
    2. Validates Gemini's selection using existing analytics_service validation rules.
    3. Runs the deterministic operation using Pandas via analytics_service (LLM NEVER does math).
    4. Sends the verified computed result back to Gemini to generate a single natural-language explanation.
    """

    def __init__(self, client: Optional[genai.Client] = None):
        self._client = client

    def get_client(self) -> genai.Client:
        """Initialize or return the cached Google GenAI client."""
        if self._client is not None:
            return self._client

        api_key = settings.GEMINI_API_KEY.strip()
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.",
            )

        self._client = genai.Client(api_key=api_key)
        return self._client

    def _clean_json_str(self, text: str) -> str:
        """Strip optional markdown code block fencing from response string."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()

    def interpret_question(
        self,
        question: str,
        column_schema: Dict[str, str],
    ) -> AnalystIntent:
        """
        Query Gemini to interpret the user's question and map it to a deterministic operation.
        Returns structured AnalystIntent.
        """
        client = self.get_client()
        schema_summary = "\n".join(
            [f"- {col}: {dtype}" for col, dtype in column_schema.items()]
        )

        prompt = f"""You are an expert data analyst assistant. A user is asking a natural language question about a dataset.
Your job is to determine WHICH deterministic calculation to run on the dataset to answer the user's question.

Dataset Schema (Column Name -> Data Type):
{schema_summary}

Supported operations:
- 'mean': Average of a numeric column (requires integer or float)
- 'sum': Total sum of a numeric column (requires integer or float)
- 'min': Minimum value of any column
- 'max': Maximum value of any column
- 'count': Number of non-null entries in a column
- 'median': Median of a numeric column (requires integer or float)
- 'std': Standard deviation of a numeric column (requires integer or float)
- 'value_counts': Frequency count of values in a categorical/string column
- 'histogram': Frequency distribution of values in a numeric column (binned count)
- 'describe': Statistical summary (mean, std, min, median, max, count) of a numeric column

CRITICAL RULES:
1. NEVER calculate or guess numerical answers yourself. Your only role is to pick the right operation and column.
2. If the user question can be answered or addressed with one of the supported operations on an available column, set can_answer=true, specify the operation, the exact column name, and optionally group_by (if the user asks for a category breakdown or comparison).
3. Mapping guidelines for general, summary, and multi-stat questions:
   - If the user asks for 'key statistics', 'summary', or 'distribution' of a numeric column, choose 'describe' (or 'mean'/'median'/'histogram') for that column with can_answer=true. Do NOT reject requests for column statistics or distributions as unanswerable.
   - If the user asks for an 'executive summary', 'overview', or general summary of the dataset, choose 'count' on the first available column with can_answer=true.
   - If the user asks about 'data quality', 'completeness', 'missing values', or 'hygiene', choose 'count' on the column mentioned or the first available column with can_answer=true.
   - If the user asks for 'frequent categories', 'breakdown', or distribution of a string/categorical column, choose 'value_counts' on that column with can_answer=true.
4. Always endeavor to answer the user's question using the closest supported operation. Only set can_answer=false if the question is completely unrelated to data analysis, asks about columns not present in the schema, or asks for unsupported operations like future forecasting or machine learning modeling.
5. The column and group_by names MUST match the exact column names from the dataset schema.
6. Do NOT choose numeric operations ('mean', 'sum', 'median', 'std', 'histogram', 'describe') for string/text columns.

User Question: "{question}"
"""

        candidate_models = [settings.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash"]
        last_error: Optional[Exception] = None

        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": AnalystIntent,
                        "temperature": 0.0,
                    },
                )
                cleaned = self._clean_json_str(response.text or "{}")
                return AnalystIntent.model_validate_json(cleaned)

            except errors.APIError as err:
                last_error = err
                # If high demand 503, rate limit 429, or transient error, try next candidate model
                if getattr(err, "code", None) in (429, 503):
                    continue
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Gemini API error: {err.message if hasattr(err, 'message') else str(err)}",
                )
            except (httpx.TimeoutException, TimeoutError) as err:
                last_error = err
                continue
            except Exception as err:
                logger.error(f"Error parsing Gemini intent: {err}")
                last_error = err
                break

        if isinstance(last_error, errors.APIError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Gemini API error: {last_error.message if hasattr(last_error, 'message') else str(last_error)}",
            )
        elif isinstance(last_error, (httpx.TimeoutException, TimeoutError)):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini API request timed out. Please try again.",
            )
        elif last_error is not None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"AI service communication failure: {str(last_error)}",
            )

        return AnalystIntent(
            can_answer=False,
            reason="Could not determine a valid analytical operation.",
        )

    def explain_result(
        self,
        question: str,
        operation: str,
        column: str,
        group_by: Optional[str],
        result: Any,
        row_count: int,
    ) -> str:
        """
        Send verified computed result to Gemini to generate exactly one natural-language explanation sentence.
        """
        client = self.get_client()

        group_clause = f" grouped by '{group_by}'" if group_by else ""
        prompt = f"""You are a friendly AI data analyst explaining numbers to a non-technical user.
User Question: "{question}"
Deterministic Calculation: {operation} on column '{column}'{group_clause}
Verified Result (computed by Pandas): {result}
Total Rows Analyzed: {row_count}

Write exactly ONE clear, concise natural-language sentence explaining this verified result.
Rules:
1. Do NOT invent, recalculate, or alter any numbers. Rely strictly on the verified result provided above.
2. If the result is a number, round it neatly if appropriate.
3. If the result is a category breakdown, mention the key groups clearly.
4. Output only the single explanation sentence, nothing else.
"""

        candidate_models = [settings.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash"]
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={"temperature": 0.2},
                )
                explanation = (response.text or "").strip()
                if explanation:
                    return explanation
            except errors.APIError as err:
                if getattr(err, "code", None) in (429, 503):
                    continue
                logger.warning(f"Gemini explanation API warning on {model_name}: {err}")
            except Exception as err:
                logger.warning(f"Gemini explanation failed on {model_name}: {err}")

        # Deterministic fallback sentence in case LLM explanation encounters transient network issue
        if group_by:
            return f"The {operation} of '{column}' by '{group_by}' was calculated across {row_count} rows."
        if operation == "describe" and isinstance(result, dict):
            return (
                f"Statistical summary for '{column}': Average is {result.get('mean')}, "
                f"median is {result.get('median')}, standard deviation is {result.get('std')}, "
                f"with values ranging from {result.get('min')} to {result.get('max')} across {row_count} rows."
            )
        return f"The {operation} of '{column}' is {result} (calculated across {row_count} rows)."

    @staticmethod
    def is_executive_summary_question(question: str) -> bool:
        """Check if question asks for an executive summary, general dataset summary, or dataset overview."""
        q = question.lower().strip()
        triggers = [
            "executive summary",
            "overview of",
            "dataset overview",
            "overview the dataset",
            "overview this dataset",
            "general summary",
            "high-level summary",
            "dataset summary",
            "summarize the dataset",
            "summarize this dataset",
            "tell me about this dataset",
            "what can you tell me about this dataset",
        ]
        if any(t in q for t in triggers):
            return True
        if q.startswith("summarize") and ("dataset" in q or "data" in q or "file" in q or "csv" in q or "excel" in q or "sheet" in q or "xlsx" in q or "xls" in q):
            return True
        if "summary of" in q and ("dataset" in q or "data" in q or "file" in q or ".csv" in q or ".xlsx" in q or ".xls" in q or "excel" in q or "sheet" in q):
            return True
        return False

    @staticmethod
    def is_data_quality_question(question: str) -> bool:
        """Check if question asks about data quality, completeness, missing values, or data hygiene."""
        q = question.lower().strip()
        triggers = [
            "data quality",
            "completeness",
            "hygiene",
            "missing value",
            "missing values",
            "missing data",
            "null value",
            "null values",
            "null count",
            "null percentage",
            "data health",
            "data cleanliness",
            "clean data",
            "are there any nulls",
            "are there any missing",
        ]
        return any(t in q for t in triggers)

    def answer_executive_summary(
        self,
        dataset_id: str,
        question: str,
        df: pd.DataFrame,
        file_path: Optional[Union[Path, str]] = None,
        storage_path: Optional[str] = None,
    ) -> AskQuestionResponse:
        """
        Synthesize a 2-3 sentence executive summary from real profiling_service data.
        Bypasses single-operation flow to avoid reduction to a generic single count.
        """
        profile = profiling_service.generate_profile(
            dataset_id=dataset_id,
            storage_path=storage_path,
            file_path=file_path,
            df=df,
        )

        num_cols = [c.name for c in profile.columns if c.data_type in ("integer", "float")]
        cat_cols = [c.name for c in profile.columns if c.data_type in ("string", "category")]
        date_cols = [c.name for c in profile.columns if c.data_type == "datetime"]

        # Extract notable numeric highlights
        priority_keywords = ["revenue", "profit", "sales", "price", "amount", "cost", "quantity", "rating", "score"]
        notable_keys = []
        for kw in priority_keywords:
            for k in profile.numeric_summary.keys():
                if kw in k.lower() and k not in notable_keys:
                    notable_keys.append(k)
        if len(notable_keys) < 3:
            for k in profile.numeric_summary.keys():
                if k not in notable_keys:
                    notable_keys.append(k)

        highlights = {}
        for k in notable_keys[:3]:
            s = profile.numeric_summary[k]
            if s and s.mean is not None:
                highlights[k] = {
                    "mean": s.mean,
                    "min": s.min,
                    "max": s.max,
                }

        hl_lines = [
            f"- '{col}': average is {vals['mean']}, ranging from {vals['min']} to {vals['max']}"
            for col, vals in highlights.items()
        ]
        hl_text = "\n".join(hl_lines) if hl_lines else "No numeric metrics available."

        prompt = f"""You are an expert AI data analyst providing an executive summary of a dataset to a business stakeholder.
User Question: "{question}"

Verified Dataset Profile (computed deterministically by Pandas):
- Filename: {profile.filename}
- Dimensions: {profile.row_count:,} rows × {profile.column_count} columns
- Structural Composition: {len(num_cols)} numerical metrics, {len(cat_cols)} categorical/text attributes, {len(date_cols)} datetime fields
- Notable Metric Highlights:
{hl_text}

Task: Write a polished, professional 2-3 sentence executive summary of this dataset.
Requirements:
1. First sentence: State the dataset size ({profile.row_count:,} rows and {profile.column_count} columns) and its structural composition ({len(num_cols)} numeric, {len(cat_cols)} categorical attributes).
2. Second/third sentence: Highlight one or two notable numeric metrics using the exact verified averages/ranges provided above (e.g. "Average net revenue is ..., ranging from ... to ...").
3. Rely STRICTLY on the real numbers provided above. Never invent, extrapolate, or alter any numbers.
4. Output only the 2-3 sentence summary.
"""

        summary_text = None
        client = self.get_client()
        candidate_models = [settings.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash"]
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={"temperature": 0.2},
                )
                text = (response.text or "").strip()
                if text:
                    summary_text = text
                    break
            except errors.APIError as err:
                if getattr(err, "code", None) in (429, 503):
                    continue
                logger.warning(f"Gemini executive summary API warning on {model_name}: {err}")
            except Exception as err:
                logger.warning(f"Gemini executive summary failed on {model_name}: {err}")

        # Deterministic fallback if Gemini encounters transient API limits
        if not summary_text:
            h_str = ""
            if highlights:
                parts = [f"average {k} is {v['mean']}" for k, v in highlights.items() if v.get("mean") is not None]
                if parts:
                    h_str = f" Key metrics include {', '.join(parts)}."
            summary_text = (
                f"The dataset '{profile.filename}' contains {profile.row_count:,} rows and {profile.column_count} columns "
                f"({len(num_cols)} numerical metrics and {len(cat_cols)} categorical attributes).{h_str}"
            )

        return AskQuestionResponse(
            question=question,
            operation_used="executive_summary",
            column_used=None,
            operation="executive_summary",
            column=None,
            group_by=None,
            result={
                "row_count": profile.row_count,
                "column_count": profile.column_count,
                "numeric_columns_count": len(num_cols),
                "categorical_columns_count": len(cat_cols),
                "highlights": highlights,
            },
            answer=summary_text,
            explanation=summary_text,
            row_count=profile.row_count,
            can_answer=True,
        )

    def answer_data_quality(
        self,
        dataset_id: str,
        question: str,
        df: pd.DataFrame,
        file_path: Optional[Union[Path, str]] = None,
        storage_path: Optional[str] = None,
    ) -> AskQuestionResponse:
        """
        Evaluate data hygiene and completeness from real profiling_service data.
        Bypasses single-operation flow to report real null counts and completeness percentages.
        """
        profile = profiling_service.generate_profile(
            dataset_id=dataset_id,
            storage_path=storage_path,
            file_path=file_path,
            df=df,
        )

        total_cols = profile.column_count
        clean_cols = [c for c in profile.columns if c.null_count == 0]
        missing_cols = [c for c in profile.columns if c.null_count > 0]
        missing_cols.sort(key=lambda c: (c.null_percentage, c.null_count), reverse=True)

        total_nulls = sum(c.null_count for c in profile.columns)
        total_cells = profile.row_count * total_cols
        completeness_pct = round(((total_cells - total_nulls) / total_cells) * 100, 2) if total_cells > 0 else 100.0

        if missing_cols:
            missing_lines = [
                f"- Column '{c.name}': {c.null_count} missing values ({c.null_percentage}% null)"
                for c in missing_cols[:5]
            ]
            missing_text = "\n".join(missing_lines)
        else:
            missing_text = "None. All columns have 0 missing values (100% complete data hygiene)."

        prompt = f"""You are an expert AI data analyst delivering a data quality and completeness evaluation.
User Question: "{question}"

Verified Data Quality Metrics (computed deterministically by Pandas):
- Filename: {profile.filename}
- Total Rows: {profile.row_count:,}
- Total Columns: {total_cols}
- Clean Columns (0 missing values): {len(clean_cols)} of {total_cols} columns
- Columns with Missing Values: {len(missing_cols)} of {total_cols} columns
- Total Null Cells: {total_nulls:,} out of {total_cells:,} total data points
- Overall Completeness Score: {completeness_pct}%
- Missing Value Breakdown by Column:
{missing_text}

Task: Write a clear, precise 2-3 sentence data quality evaluation.
Requirements:
1. State how many columns have zero missing values out of {total_cols} and state the overall completeness score ({completeness_pct}%).
2. If there are missing values, specifically identify the columns with the most missing data and their exact percentages (e.g. "Columns with the most missing data are: A (N%), B (M%)"). If all columns have zero missing values, explicitly state that all {total_cols} columns across {profile.row_count:,} rows have zero missing values and data hygiene is 100% complete.
3. Rely STRICTLY on the real numbers provided above. Never invent, guess, or modify any numbers.
4. Output only the 2-3 sentence evaluation.
"""

        quality_text = None
        client = self.get_client()
        candidate_models = [settings.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash"]
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={"temperature": 0.2},
                )
                text = (response.text or "").strip()
                if text:
                    quality_text = text
                    break
            except errors.APIError as err:
                if getattr(err, "code", None) in (429, 503):
                    continue
                logger.warning(f"Gemini data quality API warning on {model_name}: {err}")
            except Exception as err:
                logger.warning(f"Gemini data quality failed on {model_name}: {err}")

        # Deterministic fallback if Gemini encounters transient API limits
        if not quality_text:
            if missing_cols:
                top_missing = ", ".join([f"'{c.name}' ({c.null_percentage}% null)" for c in missing_cols[:3]])
                quality_text = (
                    f"Data Quality Audit: {len(clean_cols)} of {total_cols} columns have zero missing values, "
                    f"with an overall completeness score of {completeness_pct}%. "
                    f"Columns with the most missing data are: {top_missing}."
                )
            else:
                quality_text = (
                    f"Data Quality Audit: All {total_cols} columns across {profile.row_count:,} rows have zero missing values, "
                    f"demonstrating pristine data hygiene with 100% completeness."
                )

        return AskQuestionResponse(
            question=question,
            operation_used="data_quality",
            column_used=None,
            operation="data_quality",
            column=None,
            group_by=None,
            result={
                "total_columns": total_cols,
                "clean_columns": len(clean_cols),
                "columns_with_nulls": len(missing_cols),
                "total_null_cells": total_nulls,
                "completeness_percentage": completeness_pct,
                "missing_columns": [
                    {"column": c.name, "null_count": c.null_count, "null_percentage": c.null_percentage}
                    for c in missing_cols
                ],
            },
            answer=quality_text,
            explanation=quality_text,
            row_count=profile.row_count,
            can_answer=True,
        )

    def ask(
        self,
        dataset_id: str,
        file_path: Optional[Union[Path, str]] = None,
        question: Optional[str] = None,
        storage_path: Optional[str] = None,
    ) -> AskQuestionResponse:
        """
        Complete end-to-end question answering pipeline:
        1. Load dataset & schema from Supabase Storage (or disk)
        2. Check for special-case questions (Executive Summary, Data Quality) -> use profiling_service
        3. Ask Gemini for deterministic single-operation intent
        4. Validate intent with analytics_service
        5. Execute deterministic math with Pandas
        6. Generate natural language explanation
        """
        # Support flexible argument ordering
        is_dataset_file = any(
            str(file_path).lower().endswith(ext)
            for ext in [".csv", ".xlsx", ".xls"]
        )
        if question is None and isinstance(file_path, str) and not is_dataset_file:
            question = file_path
            file_path = None

        if question is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question parameter is required.",
            )

        if file_path is not None and isinstance(file_path, Path) and file_path.is_file():
            df = read_file_to_dataframe(file_path, filename=file_path.name)
        else:
            if isinstance(file_path, str) and not storage_path:
                storage_path = file_path

            resolved_name = None
            if not storage_path:
                resolved_path, resolved_name = dataset_service.get_dataset_file(dataset_id)
                storage_path = resolved_path

            try:
                file_bytes = storage_service.download_file(storage_path)
            except StorageFileNotFoundError as err:
                raise DatasetNotFoundError(str(err)) from err

            df = read_file_to_dataframe(file_bytes, filename=resolved_name or storage_path)

        # SPECIAL-CASE HANDLING: Executive Summary & Data Quality bypass single-operation flow
        if self.is_executive_summary_question(question):
            return self.answer_executive_summary(
                dataset_id=dataset_id,
                question=question,
                df=df,
                file_path=file_path,
                storage_path=storage_path,
            )

        if self.is_data_quality_question(question):
            return self.answer_data_quality(
                dataset_id=dataset_id,
                question=question,
                df=df,
                file_path=file_path,
                storage_path=storage_path,
            )

        # 1. Reuse existing profiling_service to extract column names and inferred types
        column_schema = profiling_service.get_column_types(df)

        # 2. Ask Gemini to map natural language to deterministic operation
        intent = self.interpret_question(question, column_schema)

        # Fallback for multi-stat questions if Gemini declined can_answer
        lower_q = question.lower()
        if not intent.can_answer or not intent.operation or not intent.column:
            numeric_cols = [col for col, dt in column_schema.items() if dt in ("integer", "float")]
            matched_num = next((c for c in numeric_cols if c.lower() in lower_q), None)
            if matched_num and any(k in lower_q for k in ["stat", "distribution", "spread", "breakdown"]):
                intent.can_answer = True
                intent.operation = "describe"
                intent.column = matched_num

        # Resolve case-insensitive column match if exact match not found
        if intent.column and intent.column not in df.columns:
            matched_col = next(
                (c for c in df.columns if str(c).strip().lower() == intent.column.strip().lower()),
                None,
            )
            if matched_col:
                intent.column = matched_col

        if intent.group_by and intent.group_by not in df.columns:
            matched_grp = next(
                (c for c in df.columns if str(c).strip().lower() == intent.group_by.strip().lower()),
                None,
            )
            if matched_grp:
                intent.group_by = matched_grp

        # If Gemini cannot confidently map the question to a supported operation/column
        if not intent.can_answer or not intent.operation or not intent.column:
            unsupported_msg = (
                "I can't answer that with the available operations. "
                "Please ask a question about calculating the average, sum, minimum, maximum, count, "
                "median, standard deviation, or frequency of a specific column in this dataset."
            )
            if intent.reason:
                unsupported_msg = f"I can't answer that with the available operations: {intent.reason}"

            return AskQuestionResponse(
                question=question,
                operation_used=None,
                column_used=None,
                operation=None,
                column=None,
                group_by=None,
                result=None,
                answer=unsupported_msg,
                explanation=unsupported_msg,
                row_count=None,
                can_answer=False,
            )

        # 3. Validate Gemini's chosen operation/column using EXISTING analytics_service validation
        analytics_req = AnalyticsRequest(
            column=intent.column,
            operation=intent.operation,
            group_by=intent.group_by,
        )
        try:
            analytics_service.validate_request(df, analytics_req)
        except AnalyticsValidationError as err:
            err_msg = f"I can't answer that with the available operations: {str(err)}"
            return AskQuestionResponse(
                question=question,
                operation_used=intent.operation,
                column_used=intent.column,
                operation=intent.operation,
                column=intent.column,
                group_by=intent.group_by,
                result=None,
                answer=err_msg,
                explanation=err_msg,
                row_count=None,
                can_answer=False,
            )

        # 4. Execute operation using the existing analytics_service (Pandas does the math)
        analytics_response = analytics_service.run_analysis(
            dataset_id=dataset_id,
            request=analytics_req,
            storage_path=storage_path,
            file_path=file_path,
        )

        # 5. Send verified computed result to Gemini for 1-sentence natural language explanation
        explanation = self.explain_result(
            question=question,
            operation=analytics_response.operation,
            column=analytics_response.column,
            group_by=analytics_response.group_by,
            result=analytics_response.result,
            row_count=analytics_response.row_count,
        )

        # 6. Return structured response
        return AskQuestionResponse(
            question=question,
            operation_used=analytics_response.operation,
            column_used=analytics_response.column,
            operation=analytics_response.operation,
            column=analytics_response.column,
            group_by=analytics_response.group_by,
            result=analytics_response.result,
            answer=explanation,
            explanation=explanation,
            row_count=analytics_response.row_count,
            can_answer=True,
        )


ai_analyst_service = AiAnalystService()

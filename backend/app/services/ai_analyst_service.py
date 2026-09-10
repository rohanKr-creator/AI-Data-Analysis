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

CRITICAL RULES:
1. NEVER calculate or guess numerical answers yourself. Your only role is to pick the right operation and column.
2. If the user question can be answered with one of the supported operations on an available column, set can_answer=true, specify the operation, the exact column name, and optionally group_by (if the user asks for a category breakdown or comparison).
3. If the question cannot be answered using the available columns and supported operations (e.g. asks about columns not present, asks for predictions/forecasting, or is completely unrelated to data analysis), set can_answer=false and provide a polite reason.
4. The column and group_by names MUST match the exact column names from the dataset schema.
5. Do NOT choose numeric operations ('mean', 'sum', 'median', 'std') for string/text columns.

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
                # If high demand 503 or transient error, try next candidate model
                if getattr(err, "code", None) == 503:
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
                if getattr(err, "code", None) == 503:
                    continue
                logger.warning(f"Gemini explanation API warning on {model_name}: {err}")
            except Exception as err:
                logger.warning(f"Gemini explanation failed on {model_name}: {err}")

        # Deterministic fallback sentence in case LLM explanation encounters transient network issue
        if group_by:
            return f"The {operation} of '{column}' by '{group_by}' was calculated across {row_count} rows."
        return f"The {operation} of '{column}' is {result} (calculated across {row_count} rows)."

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
        2. Ask Gemini for intent
        3. Validate intent with analytics_service
        4. Execute deterministic math with Pandas
        5. Generate 1-sentence natural language explanation
        """
        # Support flexible argument ordering
        if question is None and isinstance(file_path, str) and not file_path.endswith(".csv"):
            question = file_path
            file_path = None

        if question is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question parameter is required.",
            )

        if file_path is not None and isinstance(file_path, Path) and file_path.is_file():
            df = pd.read_csv(file_path)
        else:
            if isinstance(file_path, str) and not storage_path:
                storage_path = file_path

            if not storage_path:
                resolved_path, _ = dataset_service.get_dataset_file(dataset_id)
                storage_path = resolved_path

            try:
                file_bytes = storage_service.download_file(storage_path)
            except StorageFileNotFoundError as err:
                raise DatasetNotFoundError(str(err)) from err

            df = pd.read_csv(io.BytesIO(file_bytes))

        # 1. Reuse existing profiling_service to extract column names and inferred types
        column_schema = profiling_service.get_column_types(df)

        # 2. Ask Gemini to map natural language to deterministic operation
        intent = self.interpret_question(question, column_schema)

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
                group_by=None,
                result=None,
                answer=unsupported_msg,
                row_count=None,
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
            return AskQuestionResponse(
                question=question,
                operation_used=intent.operation,
                column_used=intent.column,
                group_by=intent.group_by,
                result=None,
                answer=f"I can't answer that with the available operations: {str(err)}",
                row_count=None,
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
            group_by=analytics_response.group_by,
            result=analytics_response.result,
            answer=explanation,
            row_count=analytics_response.row_count,
        )


ai_analyst_service = AiAnalystService()

import io
import json
import uuid
from unittest.mock import MagicMock, patch
import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors


SAMPLE_CSV = (
    b"name,department,salary,age,is_active\n"
    b"Alice,Engineering,75000.0,30,True\n"
    b"Bob,Engineering,85000.0,35,True\n"
    b"Charlie,Marketing,60000.0,28,False\n"
    b"Diana,Marketing,65000.0,32,True\n"
    b"Evan,Design,70000.0,26,False\n"
)


def _upload_sample_dataset(client: TestClient) -> str:
    """Helper to upload a sample CSV dataset and return its dataset_id."""
    files = {"file": ("company_staff.csv", io.BytesIO(SAMPLE_CSV), "text/csv")}
    res = client.post("/api/v1/datasets/upload", files=files)
    assert res.status_code == 201
    return res.json()["dataset_id"]


def test_ask_valid_question_numeric_mean(client: TestClient):
    """
    Test a valid question that maps to a real operation (mean on salary).
    Mocks Gemini API so no real network or quota is consumed.
    Verifies that:
    1. Gemini picks the operation 'mean' and column 'salary'.
    2. Pandas calculates the exact 71000.0 mean deterministically.
    3. Gemini receives the real 71000.0 result and returns an explanation sentence.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_intent_res = MagicMock()
    mock_intent_res.text = json.dumps({
        "can_answer": True,
        "operation": "mean",
        "column": "salary",
        "group_by": None,
        "reason": None,
    })

    mock_explain_res = MagicMock()
    mock_explain_res.text = "The average salary across the company is $71,000.00."

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [
        mock_intent_res,
        mock_explain_res,
    ]

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "What is the average salary?"}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["question"] == "What is the average salary?"
    assert data["operation_used"] == "mean"
    assert data["column_used"] == "salary"
    assert data["group_by"] is None
    # Verify Pandas did the math: (75000 + 85000 + 60000 + 65000 + 70000) / 5 = 71000.0
    assert data["result"] == 71000.0
    assert data["answer"] == "The average salary across the company is $71,000.00."
    assert data["row_count"] == 5

    # Verify Gemini was called twice: once for intent, once for explanation
    assert mock_client.models.generate_content.call_count == 2


def test_ask_valid_question_with_group_by(client: TestClient):
    """
    Test a valid question with group_by (mean salary by department).
    Mocks Gemini API.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_intent_res = MagicMock()
    mock_intent_res.text = json.dumps({
        "can_answer": True,
        "operation": "mean",
        "column": "salary",
        "group_by": "department",
        "reason": None,
    })

    mock_explain_res = MagicMock()
    mock_explain_res.text = "Engineering has the highest average salary at $80,000."

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = [
        mock_intent_res,
        mock_explain_res,
    ]

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "What is the average salary grouped by department?"}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["operation_used"] == "mean"
    assert data["column_used"] == "salary"
    assert data["group_by"] == "department"
    assert data["result"]["Engineering"] == 80000.0
    assert data["result"]["Marketing"] == 62500.0
    assert data["result"]["Design"] == 70000.0
    assert data["answer"] == "Engineering has the highest average salary at $80,000."
    assert data["row_count"] == 5


def test_ask_unmapped_or_unrelated_question(client: TestClient):
    """
    Test asking a question that does not map to any valid column/operation
    (e.g., Gemini returns can_answer=False).
    Should return an honest, polite explanation without fake/hallucinated data.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_intent_res = MagicMock()
    mock_intent_res.text = json.dumps({
        "can_answer": False,
        "operation": None,
        "column": None,
        "group_by": None,
        "reason": "The question is unrelated to the columns in this dataset.",
    })

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_intent_res

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "What is the weather in Paris?"}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["operation_used"] is None
    assert data["column_used"] is None
    assert data["result"] is None
    assert "I can't answer that with the available operations" in data["answer"]
    # Only one call to Gemini (no explanation call needed for unmapped questions)
    assert mock_client.models.generate_content.call_count == 1


def test_ask_gemini_selects_incompatible_column_operation(client: TestClient):
    """
    Test when Gemini returns an operation incompatible with the column's data type
    (e.g., 'mean' on string column 'name').
    The backend validation logic must catch this and return a clear message without crashing.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_intent_res = MagicMock()
    mock_intent_res.text = json.dumps({
        "can_answer": True,
        "operation": "mean",
        "column": "name",  # string column
        "group_by": None,
        "reason": None,
    })

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_intent_res

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "Calculate the average of names."}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["result"] is None
    assert "I can't answer that with the available operations" in data["answer"]
    assert "requires a numeric column" in data["answer"]


def test_ask_non_existent_dataset_id_returns_404(client: TestClient):
    """Test that requesting /ask on a non-existent dataset UUID returns 404."""
    random_id = str(uuid.uuid4())
    payload = {"question": "What is the total salary?"}
    response = client.post(f"/api/v1/datasets/{random_id}/ask", json=payload)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_ask_invalid_dataset_uuid_format_returns_404(client: TestClient):
    """Test that requesting /ask with a malformed dataset ID returns 404."""
    payload = {"question": "What is the total salary?"}
    response = client.post("/api/v1/datasets/invalid-uuid-format/ask", json=payload)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_ask_gemini_api_timeout_handled_gracefully(client: TestClient):
    """
    Test that when Gemini API times out, it is handled gracefully with 503,
    not an unhandled 500 crash.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = httpx.TimeoutException("Connection timed out")

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "What is the maximum salary?"}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 503
    assert "timed out" in response.json()["detail"].lower() or "service" in response.json()["detail"].lower()


def test_ask_gemini_api_error_handled_gracefully(client: TestClient):
    """
    Test that when Gemini API returns an API error (e.g. rate limit, auth error),
    the endpoint returns 503 with a readable detail message.
    """
    dataset_id = _upload_sample_dataset(client)

    mock_client = MagicMock()
    api_error = errors.APIError(
        code=429,
        response_json={"error": {"message": "Resource has been exhausted (rate limit)"}},
    )
    mock_client.models.generate_content.side_effect = api_error

    with patch("app.services.ai_analyst_service.ai_analyst_service.get_client", return_value=mock_client):
        payload = {"question": "What is the maximum salary?"}
        response = client.post(f"/api/v1/datasets/{dataset_id}/ask", json=payload)

    assert response.status_code == 503
    assert "rate limit" in response.json()["detail"].lower() or "gemini api error" in response.json()["detail"].lower()

import type {
  AnalyticsRequest,
  AnalyticsResponse,
  DatasetProfileResponse,
  DatasetUploadResponse,
} from '../types/api';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const errorData = await response.json();
    if (errorData && errorData.detail) {
      if (typeof errorData.detail === 'string') {
        return errorData.detail;
      }
      if (Array.isArray(errorData.detail)) {
        return errorData.detail
          .map((item: { msg?: string } | string) =>
            typeof item === 'object' && item.msg ? item.msg : JSON.stringify(item)
          )
          .join('; ');
      }
      return JSON.stringify(errorData.detail);
    }
  } catch {
    // Response was not JSON
  }

  return response.statusText || `Request failed with status code ${response.status}`;
}

export async function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/datasets/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    throw new Error(
      `Unable to connect to backend server at ${API_BASE_URL}. Ensure the backend is running. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

export async function getDatasetProfile(
  datasetId: string
): Promise<DatasetProfileResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/profile`);
  } catch (err) {
    throw new Error(
      `Unable to connect to backend server at ${API_BASE_URL}. Ensure the backend is running. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

export async function analyzeDataset(
  datasetId: string,
  request: AnalyticsRequest
): Promise<AnalyticsResponse> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/analyze`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );
  } catch (err) {
    throw new Error(
      `Unable to connect to backend server at ${API_BASE_URL}. Ensure the backend is running. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

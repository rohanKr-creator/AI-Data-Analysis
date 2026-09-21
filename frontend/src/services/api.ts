import type {
  AnalyticsRequest,
  AnalyticsResponse,
  AskQuestionResponse,
  BillingStatusResponse,
  CheckoutResponse,
  DatasetListItem,
  DatasetProfileResponse,
  DatasetUploadResponse,
  PortalResponse,
  UserProfileResponse,
  UserUsageResponse,
} from '../types/api';
import { supabase } from '../lib/supabaseClient';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Supabase session lookup failed or offline
  }
  return {};
}

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

  if (response.status === 401) {
    return 'Authentication required or session expired. Please sign in again.';
  }
  if (response.status === 403) {
    return 'Access forbidden: You do not have permission to access this dataset.';
  }
  if (response.status === 429) {
    return 'Daily tier limit reached. Please upgrade to Pro for unlimited access.';
  }

  return response.statusText || `Request failed with status code ${response.status}`;
}

export async function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const authHeaders = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/datasets/upload`, {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
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
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/profile`, {
      headers: {
        ...authHeaders,
      },
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

export async function analyzeDataset(
  datasetId: string,
  request: AnalyticsRequest
): Promise<AnalyticsResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/analyze`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
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

export async function listUserDatasets(): Promise<DatasetListItem[]> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/datasets`, {
      method: 'GET',
      headers: {
        ...authHeaders,
      },
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

export async function askDatasetQuestion(
  datasetId: string,
  question: string
): Promise<AskQuestionResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/datasets/${encodeURIComponent(datasetId)}/ask`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ question }),
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

export async function getAuthMe(token: string): Promise<UserProfileResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

export async function getUserUsage(): Promise<UserUsageResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/usage`, {
      method: 'GET',
      headers: {
        ...authHeaders,
      },
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

export async function createCheckoutSession(
  successUrl?: string,
  cancelUrl?: string
): Promise<CheckoutResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });
  } catch (err) {
    throw new Error(
      `Unable to connect to billing server at ${API_BASE_URL}. Ensure backend is running. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

export async function createCustomerPortalSession(
  returnUrl?: string
): Promise<PortalResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/billing/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        return_url: returnUrl,
      }),
    });
  } catch (err) {
    throw new Error(
      `Unable to connect to billing server at ${API_BASE_URL}. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/billing/status`, {
      method: 'GET',
      headers: {
        ...authHeaders,
      },
    });
  } catch (err) {
    throw new Error(
      `Unable to connect to billing server at ${API_BASE_URL}. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}


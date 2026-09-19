/**
 * Utility to warm up the backend before executing E2E tests.
 * Render free-tier instances sleep after 15 minutes of inactivity;
 * this pre-flight ping ensures the API is responsive before tests begin.
 */
export async function ensureBackendAwake(maxWaitMs = 45000): Promise<boolean> {
  const backendHealthUrl =
    process.env.E2E_API_HEALTH_URL ||
    'https://ai-data-analysis-cy5e.onrender.com/api/v1/health';

  const startTime = Date.now();
  console.log(`[E2E Warmup] Pinging backend at ${backendHealthUrl}...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(backendHealthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log(`[E2E Warmup] Backend is warm and responsive (${Date.now() - startTime}ms):`, (data as Record<string, unknown>).status || 'OK');
        return true;
      }
    } catch {
      // Backend is still waking up, wait 3 seconds before next attempt
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.warn(`[E2E Warmup] Backend did not respond within ${maxWaitMs / 1000}s, proceeding with tests...`);
  return false;
}

import { Page, expect } from '@playwright/test';

export interface ErrorListenerOptions {
  ignorePatterns?: (string | RegExp)[];
}

export interface ErrorListener {
  errors: string[];
  pageErrors: Error[];
  assertNoErrors: () => void;
}

/**
 * Attaches listeners for page errors (uncaught exceptions) and console error messages.
 * Fails the test if any uncaught runtime errors occur.
 * Optional ignorePatterns allows intentional HTTP error responses (e.g. 429 simulation).
 */
export function attachErrorListener(
  page: Page,
  options?: ErrorListenerOptions
): ErrorListener {
  const errors: string[] = [];
  const pageErrors: Error[] = [];

  page.on('pageerror', (exception) => {
    // Uncaught JavaScript exception in page context
    const message = `[PAGE ERROR] ${exception.name}: ${exception.message}\n${exception.stack || ''}`;
    console.error(message);
    pageErrors.push(exception);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore benign favicon or external font lookup 404s if any
      if (text.includes('favicon.ico') || text.includes('ERR_BLOCKED_BY_CLIENT')) {
        return;
      }
      // Check for user-defined intentional ignore patterns (e.g. 429 status code)
      if (
        options?.ignorePatterns?.some((p) =>
          typeof p === 'string' ? text.includes(p) : p.test(text)
        )
      ) {
        return;
      }
      errors.push(`[CONSOLE ERROR] ${text}`);
      console.error(`[CONSOLE ERROR] ${text}`);
    }
  });

  return {
    errors,
    pageErrors,
    assertNoErrors: () => {
      const allErrors = [
        ...pageErrors.map((e) => `[UNCAUGHT EXCEPTION] ${e.message}\n${e.stack}`),
        ...errors,
      ];
      if (allErrors.length > 0) {
        expect(
          allErrors,
          `Uncaught browser errors detected during test execution:\n${allErrors.join('\n---\n')}`
        ).toEqual([]);
      }
    },
  };
}

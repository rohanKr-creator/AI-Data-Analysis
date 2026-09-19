import { Page, expect } from '@playwright/test';

export interface TestUserCredentials {
  email: string;
  password: string;
  isPreconfigured: boolean;
}

/**
 * Returns credentials from environment variables if set,
 * or dedicated pre-confirmed credentials, or generates a fresh
 * unique timestamped test account when signup mode is requested.
 */
export function getTestCredentials(forceUniqueSignup = false): TestUserCredentials {
  if (forceUniqueSignup || process.env.E2E_SIGNUP_MODE === 'true') {
    return {
      email: `test+${Date.now()}@example.com`,
      password: 'Password123!Secure',
      isPreconfigured: false,
    };
  }

  if (process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD) {
    return {
      email: process.env.E2E_TEST_EMAIL,
      password: process.env.E2E_TEST_PASSWORD,
      isPreconfigured: true,
    };
  }

  // Pre-confirmed dedicated test account created for E2E runs
  return {
    email: 'e2e_test_runner@aianalyst.dev',
    password: 'Password123!Secure',
    isPreconfigured: true,
  };
}

/**
 * Ensures the browser session is authenticated.
 * Handles both sign-in (preconfigured user) and signup (unique user).
 */
export async function ensureAuthenticated(
  page: Page,
  forceUniqueSignup = false
): Promise<TestUserCredentials> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // If already on dashboard
  const dropzone = page.locator('.dropzone-container, .dropzone-card');
  if (await dropzone.isVisible({ timeout: 3000 }).catch(() => false)) {
    return { email: 'already-authenticated@example.com', password: '', isPreconfigured: true };
  }

  const creds = getTestCredentials(forceUniqueSignup);

  // Confirm Auth Page is present
  await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15000 });

  if (creds.isPreconfigured) {
    // Log in with preconfigured credentials
    await page.fill('#auth-email', creds.email);
    await page.fill('#auth-password', creds.password);
    await page.click('button[type="submit"]:has-text("Log In"), button[type="submit"]:has-text("Sign In")');
  } else {
    // Switch to sign up mode
    const signupBtn = page.locator('button:has-text("Sign up")');
    if (await signupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signupBtn.click();
    }

    // Fill registration fields
    const nameInput = page.locator('#auth-name');
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill('E2E Analyst');
    }
    await page.fill('#auth-email', creds.email);
    await page.fill('#auth-password', creds.password);

    // Submit sign up
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
  }

  // Verify dashboard loads
  await expect(page.locator('.dropzone-container, .dropzone-card, .saas-sidebar')).toBeVisible({
    timeout: 25000,
  });

  return creds;
}

/**
 * Logs out the current user and verifies return to the auth page.
 */
export async function signOut(page: Page): Promise<void> {
  const logoutBtn = page.locator('.navbar-logout-btn, button:has-text("Log Out")');
  await expect(logoutBtn).toBeVisible({ timeout: 10000 });
  await logoutBtn.click();

  // Verify redirected to Auth Page
  await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15000 });
}

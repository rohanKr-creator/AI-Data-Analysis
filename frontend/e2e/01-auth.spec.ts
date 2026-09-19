import { test, expect } from '@playwright/test';
import { attachErrorListener } from './helpers/error-listener';
import { getTestCredentials, signOut } from './helpers/auth';

test.describe('Authentication & Session Management', () => {
  test('unauthenticated visitor sees Auth Page and can register, authenticate, and log out', async ({ page }) => {
    const errorListener = attachErrorListener(page);

    // 1. Load the site when logged out
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 2. Confirm login page shows, not the dashboard
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#auth-password')).toBeVisible();
    await expect(page.locator('.saas-sidebar')).not.toBeVisible();
    await expect(page.locator('.dropzone-container, .dropzone-card')).not.toBeVisible();

    // 3. Register a new test account
    const creds = getTestCredentials();

    if (creds.isPreconfigured) {
      await page.fill('#auth-email', creds.email);
      await page.fill('#auth-password', creds.password);
      await page.click('button[type="submit"]:has-text("Log In"), button[type="submit"]:has-text("Sign In")');
    } else {
      // Toggle to sign up mode
      const signupBtn = page.locator('button:has-text("Sign up")');
      await signupBtn.click();

      // Enter signup details
      const nameInput = page.locator('#auth-name');
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.fill('QA Inspector');
      }
      await page.fill('#auth-email', creds.email);
      await page.fill('#auth-password', creds.password);

      // Submit registration
      const submitBtn = page.locator('button[type="submit"]');
      await submitBtn.click();
    }

    // 4. After login, confirm dashboard/landing loads correctly
    await expect(page.locator('.dropzone-container, .dropzone-card')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.navbar-auth-group')).toBeVisible();
    await expect(page.locator('.user-email-display')).toContainText(creds.email.split('@')[0]);

    // 5. Log out, confirm returns to login page
    await signOut(page);
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('.dropzone-container, .dropzone-card')).not.toBeVisible();

    // 6. Assert zero runtime console/page errors
    errorListener.assertNoErrors();
  });
});

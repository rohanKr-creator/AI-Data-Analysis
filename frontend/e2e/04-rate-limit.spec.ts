import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachErrorListener } from './helpers/error-listener';
import { ensureAuthenticated } from './helpers/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('429 Rate-Limit & Upgrade Flow', () => {
  test('handles 429 upload rate-limit gracefully and launches Upgrade Modal', async ({ page }) => {
    // Intercepting an intentional 429 response produces a benign console network error
    const errorListener = attachErrorListener(page, {
      ignorePatterns: [/status of 429/, /429/],
    });

    // 1. Authenticate and reach the workspace
    await ensureAuthenticated(page);

    // 2. Intercept dataset upload and simulate HTTP 429 Too Many Requests
    await page.route('**/api/v1/datasets/upload', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Free tier limit reached: 5 uploads per day. Upgrade to Pro for unlimited access.',
        }),
      });
    });

    // 3. Trigger upload with fixture file
    const csvFilePath = path.join(__dirname, 'fixtures', 'test_sales.csv');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvFilePath);

    // 4. Verify the 429 alert banner is displayed
    const errorAlert = page.locator('.dropzone-alert.alert-error');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert).toContainText('Free tier limit reached: 5 uploads per day');

    // 5. Verify the "Upgrade to Pro" action button appears within the error alert
    const upgradeBtn = errorAlert.locator('.dropzone-upgrade-btn');
    await expect(upgradeBtn).toBeVisible({ timeout: 5000 });
    await expect(upgradeBtn).toContainText('Upgrade to Pro');

    // 6. Click the Upgrade button and verify the Upgrade Modal opens
    await upgradeBtn.click();

    const upgradeModal = page.locator('.modal-container.upgrade-modal');
    await expect(upgradeModal).toBeVisible({ timeout: 10000 });
    await expect(upgradeModal.locator('.modal-title')).toContainText('Upgrade to Pro');

    // 7. Verify the pricing features and pro upgrade CTA in the modal
    await expect(upgradeModal.locator('.pricing-card')).toHaveCount(2);

    // 8. Close the modal and confirm clean dismissal
    const closeBtn = upgradeModal.locator('.modal-close-btn');
    await closeBtn.click();
    await expect(upgradeModal).not.toBeVisible();

    // 9. Assert zero unhandled runtime JavaScript exceptions
    errorListener.assertNoErrors();
  });
});

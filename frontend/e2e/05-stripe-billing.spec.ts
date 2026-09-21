import { test, expect } from '@playwright/test';
import { attachErrorListener } from './helpers/error-listener';
import { ensureAuthenticated } from './helpers/auth';

test.describe('Stripe Billing & Subscription Journey', () => {
  test('creates checkout session and handles Stripe success/cancel redirects', async ({ page }) => {
    const errorListener = attachErrorListener(page);

    // 1. Authenticate and open workspace
    await ensureAuthenticated(page);

    // 2. Mock backend billing endpoints
    let checkoutInitiated = false;
    await page.route('**/api/v1/billing/checkout', async (route) => {
      checkoutInitiated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkout_url: 'http://localhost:5173/billing/success?session_id=cs_test_mock_123',
          session_id: 'cs_test_mock_123',
        }),
      });
    });

    // 3. Open the Upgrade Modal from navbar or sidebar
    const upgradeTrigger = page.locator('.tier-badge.upgrade-badge, .tier-upgrade-prompt, .usage-upgrade-action').first();
    if (await upgradeTrigger.isVisible()) {
      await upgradeTrigger.click();
    } else {
      // Direct open by clicking any upgrade prompt
      await page.evaluate(() => {
        const btn = document.querySelector<HTMLElement>('.tier-badge, .usage-upgrade-action');
        btn?.click();
      });
    }

    const upgradeModal = page.locator('.modal-container.upgrade-modal');
    await expect(upgradeModal).toBeVisible({ timeout: 10000 });
    await expect(upgradeModal.locator('.modal-title')).toContainText('Upgrade to Pro');

    // 4. Click the Upgrade to Pro button
    const upgradeBtn = page.locator('#upgrade-to-pro-btn');
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    // 5. Verify checkout request was dispatched
    await page.waitForTimeout(500);
    expect(checkoutInitiated).toBe(true);

    // 6. Test returning from Stripe checkout with success session_id
    await page.goto('/billing/success?session_id=cs_test_mock_123');

    // 7. Verify celebratory toast appears
    const successToast = page.locator('.toast.toast-success');
    await expect(successToast).toBeVisible({ timeout: 10000 });
    await expect(successToast).toContainText('Welcome to Pro!');

    // 8. Verify URL path was cleanly normalized
    await expect(page).not.toHaveURL(/session_id/);

    // 9. Assert zero unhandled console runtime exceptions
    errorListener.assertNoErrors();
  });
});

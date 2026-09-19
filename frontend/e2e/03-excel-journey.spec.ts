import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachErrorListener } from './helpers/error-listener';
import { ensureAuthenticated, signOut } from './helpers/auth';
import { ensureBackendAwake } from './helpers/backend-warmup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Excel (.xlsx) End-to-End User Journey', () => {
  test.beforeAll(async () => {
    // Ensure backend is awake
    await ensureBackendAwake();
  });

  test('uploads Excel file, profiles data, runs analysis, renders charts, queries AI Analyst, and tracks usage', async ({ page }) => {
    const errorListener = attachErrorListener(page);

    // 1. Authenticate and reach the workspace dashboard
    await ensureAuthenticated(page);

    // 2. Locate the file input and upload test_sales.xlsx
    const xlsxFilePath = path.join(__dirname, 'fixtures', 'test_sales.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(xlsxFilePath);

    // 3. Confirm upload succeeds and profile data renders accurately
    await expect(page.locator('.active-dataset-pill')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.active-dataset-pill')).toContainText('test_sales.xlsx');
    await expect(page.locator('.active-dataset-pill')).toContainText('7 rows');

    // Confirm Overview statistics cards display row and column counts
    await expect(page.locator('.metric-cards-grid')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.metric-card:has-text("Total Observations") .metric-card-value')).toContainText('7');
    await expect(page.locator('.metric-card:has-text("Feature Columns") .metric-card-value')).toContainText('7');

    // Confirm column statistical highlights render (e.g. salary, sales_amount)
    await expect(page.locator('.stats-highlight-row:has-text("salary")')).toBeVisible();

    // 4. Navigate to Analysis Workbench & execute an aggregation
    const analysisTab = page.locator('.sidebar-link:has-text("Analysis Workbench")');
    await analysisTab.click();

    // Select salary column and run mean analysis
    await page.selectOption('#workbench-column', 'salary');

    const runBtn = page.locator('button[type="submit"]:has-text("Run Analysis")');
    await runBtn.click();

    // Confirm real numeric result displays in scalar card
    const scalarCard = page.locator('.result-scalar-card');
    await expect(scalarCard).toBeVisible({ timeout: 20000 });
    await expect(scalarCard.locator('.scalar-big-value')).not.toBeEmpty();

    // 5. Navigate to Visualizations & confirm charts render
    const chartsTab = page.locator('.sidebar-link:has-text("Visualizations")');
    await chartsTab.click();

    // Wait for at least one Recharts SVG surface to render
    const chartSvg = page.locator('.recharts-responsive-container svg.recharts-surface').first();
    await expect(chartSvg).toBeVisible({ timeout: 25000 });

    // 6. Inspect usage pill before query
    const usagePill = page.locator('.navbar-tier-pill');
    let initialCount: number | null = null;
    if (await usagePill.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = (await usagePill.textContent()) || '';
      const match = text.match(/(\d+)\/\d+\s*Qs/);
      if (match) {
        initialCount = parseInt(match[1], 10);
      }
    }

    // 7. Navigate to AI Analyst & ask a question
    const aiTab = page.locator('.sidebar-link:has-text("AI Analyst")');
    await aiTab.click();

    // Send query
    const chatInput = page.locator('input.chat-input');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('What is the total sales amount?');

    const sendBtn = page.locator('button.chat-send-btn');
    await sendBtn.click();

    // Wait for AI response message to arrive
    const assistantResponses = page.locator('.chat-message-row.message-assistant:not(.thinking-bubble) .message-text');
    await expect(assistantResponses.nth(1)).toBeVisible({ timeout: 45000 });
    const answerText = await assistantResponses.nth(1).textContent();
    expect(answerText).toBeTruthy();
    expect(answerText?.length).toBeGreaterThan(10);

    // 8. Check usage counter updates or increments correctly after the ask
    await expect(usagePill).toBeVisible();
    if (initialCount !== null) {
      await expect(usagePill).toContainText(`${initialCount + 1}/`);
    } else {
      const usageText = await usagePill.textContent();
      expect(usageText).toMatch(/(PRO|\d+\/\d+ Qs)/);
    }

    // 9. Log out, confirm returns to login page
    await signOut(page);
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15000 });

    // 10. Assert zero runtime errors or unhandled console exceptions
    errorListener.assertNoErrors();
  });
});

import { test } from '@playwright/test';

const BASE = 'http://localhost:3333';
const pages = [
  { nav: null, name: 'dashboard' },
  { nav: /파이프라인/, name: 'pipeline' },
  { nav: /바이어/, name: 'buyers' },
  { nav: /이메일/, name: 'emails' },
  { nav: /KPI/, name: 'kpi' },
  { nav: /도메인/, name: 'domain' },
];

test('모든 페이지 스크린샷', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `test-results/screenshots/dashboard.png`, fullPage: false });

  for (const p of pages.slice(1)) {
    await page.locator('nav').getByRole('button', { name: p.nav! }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/screenshots/${p.name}.png`, fullPage: false });
  }
});

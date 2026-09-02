import { expect, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';
import {
  expectSearchVisible,
  expectTabVisible,
} from './tabs';
import { marketFilterTrigger } from './market';

export async function expectDropsChrome(page: Page): Promise<void> {
  await expectSearchVisible(page, 'Search drops');
  await expect(page.locator('[data-drops-ready]')).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(page.locator('[data-drops-ready]')).toHaveCount(1);
  await expect(page.locator('[data-drops-loading]')).toHaveCount(0);
  await expectTabVisible(page, 'Drop sort', 'Live');
  await expectTabVisible(page, 'Drop sort', 'Upcoming');
  await expect(marketFilterTrigger(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

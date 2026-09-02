import { expect, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';
import {
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
} from './tabs';
import { marketFilterTrigger } from './market';

export function dropsReadyRail(page: Page) {
  return page.locator('[data-drops-ready]');
}

export async function expectDropsChrome(page: Page): Promise<void> {
  await expectSearchVisible(page, 'Search drops');
  await expect(dropsReadyRail(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(dropsReadyRail(page)).toHaveCount(1);
  await expect(page.locator('[data-drops-loading]')).toHaveCount(0);
  await expectTabVisible(page, 'Drop sort', 'Live');
  await expectTabVisible(page, 'Drop sort', 'Upcoming');
  await expect(
    dropsReadyRail(page).getByRole('tab', { name: 'Upcoming' })
  ).toBeEnabled({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(marketFilterTrigger(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

/** Click a sort chip on the ready rail — retries until the URL matches. */
export async function clickDropsSortAndWaitUrl(
  page: Page,
  name: string,
  sort: string | null
): Promise<void> {
  const chip = dropsReadyRail(page).getByRole('tab', { name });
  await expect(async () => {
    await chip.click();
    expect(new URL(page.url()).searchParams.get('sort')).toBe(sort);
  }).toPass({ timeout: E2E_CHROME_TIMEOUT_MS });
  if (sort == null) {
    await expectTabSelected(page, 'Drop sort', 'Live');
    return;
  }
  await expectTabSelected(page, 'Drop sort', name);
}

import { expect, type Locator, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';

export function tablist(page: Page, name: string | RegExp): Locator {
  return page.getByRole('tablist', { name });
}

export function tab(
  page: Page,
  tablistName: string | RegExp,
  tabName: string | RegExp
): Locator {
  return tablist(page, tablistName).getByRole('tab', { name: tabName });
}

export async function expectTabVisible(
  page: Page,
  tablistName: string | RegExp,
  tabName: string | RegExp,
  opts?: { timeout?: number }
): Promise<void> {
  await expect(tab(page, tablistName, tabName)).toBeVisible({
    timeout: opts?.timeout ?? E2E_CHROME_TIMEOUT_MS,
  });
}

export async function expectTabSelected(
  page: Page,
  tablistName: string | RegExp,
  tabName: string | RegExp,
  opts?: { timeout?: number }
): Promise<void> {
  await expect(tab(page, tablistName, tabName)).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: opts?.timeout ?? E2E_CHROME_TIMEOUT_MS }
  );
}

export async function clickTab(
  page: Page,
  tablistName: string | RegExp,
  tabName: string | RegExp
): Promise<void> {
  await tab(page, tablistName, tabName).click();
}

export async function clickTabAndWaitUrl(
  page: Page,
  tablistName: string | RegExp,
  tabName: string | RegExp,
  url: string | RegExp | ((url: URL) => boolean)
): Promise<void> {
  await clickTab(page, tablistName, tabName);
  await page.waitForURL(url, { timeout: E2E_CHROME_TIMEOUT_MS });
}

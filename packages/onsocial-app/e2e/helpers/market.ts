import { expect, type Locator, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';
import {
  expectChoiceMenuVisible,
  expectSearchVisible,
  expectTabVisible,
} from './tabs';

/** Filter trigger — copy is "Filter" or a medium · format summary. */
export function marketFilterTrigger(page: Page): Locator {
  return page.getByRole('button', { name: /Open filter menu/ });
}

export async function expectMarketChrome(page: Page): Promise<void> {
  await expectSearchVisible(page, 'Search Market listings');
  // Loading shells also use .market-page — toolbar is the ready chrome.
  await expect(page.locator('.market-listing-toolbar')).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expectTabVisible(page, 'Listing type', 'All');
  await expectTabVisible(page, 'Listing type', 'Auctions');
  await expect(marketFilterTrigger(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expectChoiceMenuVisible(page, 'Sort');
}

export async function expectMarketFilterSummary(
  page: Page,
  text: string | RegExp
): Promise<void> {
  await expect(marketFilterTrigger(page)).toContainText(text, {
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

export async function openMarketFilter(page: Page): Promise<void> {
  await marketFilterTrigger(page).click();
  await expect(page.getByRole('listbox', { name: 'Medium' })).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

export function mediumOption(page: Page, name: string | RegExp): Locator {
  return page.getByRole('listbox', { name: 'Medium' }).getByRole('option', {
    name,
  });
}

export async function expectMediumSelected(
  page: Page,
  name: string | RegExp
): Promise<void> {
  await expect(mediumOption(page, name)).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: E2E_CHROME_TIMEOUT_MS }
  );
}

export async function pickMediumAndWaitUrl(
  page: Page,
  name: string,
  url: string | RegExp
): Promise<void> {
  await mediumOption(page, name).click();
  await page.waitForURL(url, { timeout: E2E_CHROME_TIMEOUT_MS });
}

export async function closeMarketFilter(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done' });
  if (await done.isVisible()) {
    await done.click();
    return;
  }
  await page.getByRole('button', { name: 'Close filter' }).click();
}

/** Results tabpanel is hidden until at least one listing paints. */
export function marketListingResults(page: Page): Locator {
  return page.locator('#market-listing-results');
}

export function marketListSkeleton(page: Page): Locator {
  return page.locator('.market-listing-list--skeleton');
}

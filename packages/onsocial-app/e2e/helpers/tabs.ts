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

/** SearchField textbox by accessible name (`ariaLabel ?? placeholder`). */
export function searchField(page: Page, name: string | RegExp): Locator {
  return page.getByRole('textbox', { name });
}

export async function expectSearchVisible(
  page: Page,
  name: string | RegExp,
  opts?: { timeout?: number }
): Promise<void> {
  await expect(searchField(page, name)).toBeVisible({
    timeout: opts?.timeout ?? E2E_CHROME_TIMEOUT_MS,
  });
}

export async function expectSearchHidden(
  page: Page,
  name: string | RegExp
): Promise<void> {
  await expect(searchField(page, name)).toHaveCount(0);
}

/**
 * ChoiceDrawerMenu trigger — default aria is `Open ${label.toLowerCase()} menu`.
 */
export function choiceMenu(page: Page, label: string): Locator {
  return page.getByRole('button', {
    name: `Open ${label.toLowerCase()} menu`,
  });
}

export async function expectChoiceMenuVisible(
  page: Page,
  label: string,
  opts?: { timeout?: number; containsText?: string | RegExp }
): Promise<void> {
  const trigger = choiceMenu(page, label);
  await expect(trigger).toBeVisible({
    timeout: opts?.timeout ?? E2E_CHROME_TIMEOUT_MS,
  });
  if (opts?.containsText != null) {
    await expect(trigger).toContainText(opts.containsText);
  }
}

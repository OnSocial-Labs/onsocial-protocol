import { expect, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './navigation';

/** Keep in sync with `COMPOSER_THREAD_DRAFT_STORAGE_PREFIX`. */
const COMPOSER_THREAD_DRAFT_STORAGE_PREFIX = 'os-compose-thread:';

export const E2E_THREAD_ROOT = 'e2e thread root';
export const E2E_THREAD_EXTRA = 'e2e thread extra';

export async function clearComposerThreadDrafts(page: Page): Promise<void> {
  await page.addInitScript((prefix) => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  }, COMPOSER_THREAD_DRAFT_STORAGE_PREFIX);
}

export function composerBeatFields(page: Page) {
  return page.locator('textarea.guild-composer-input');
}

export async function openHomePostComposer(page: Page): Promise<void> {
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const compose = page.getByRole('button', { name: 'Compose a post' });
  await expect(compose).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await compose.click();
  await expect(
    page.getByRole('textbox', { name: 'Share something…' })
  ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
}

/**
 * Plus keeps the current beat focused (`mousedown` preventDefault). Playwright
 * coordinate clicks often hit the dock or Next overlay instead of the tool.
 */
export async function clickAddThreadBeat(page: Page): Promise<void> {
  await dismissNextDevOverlay(page);
  const plus = page.getByRole('button', { name: 'Add to thread' });
  await expect(plus).toBeEnabled();
  await plus.evaluate((el) => {
    if (el instanceof HTMLButtonElement) el.click();
  });
  await expect(page.getByRole('textbox', { name: 'Post 2' })).toBeVisible();
}

export async function fillHomeThreadDraft(page: Page): Promise<void> {
  await page
    .getByRole('textbox', { name: 'Share something…' })
    .fill(E2E_THREAD_ROOT);
  await clickAddThreadBeat(page);
  await page.getByRole('textbox', { name: 'Post 2' }).fill(E2E_THREAD_EXTRA);
  await expect(composerBeatFields(page)).toHaveCount(2);
  await expect(composerBeatFields(page).nth(0)).toHaveValue(E2E_THREAD_ROOT);
  await expect(composerBeatFields(page).nth(1)).toHaveValue(E2E_THREAD_EXTRA);
}

import { expect, type Locator } from '@playwright/test';

/** Page-empty and list-retry recoveries share `.os-empty-action` → borderless `sm`. */
export async function expectOsEmptyAction(action: Locator): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/os-sheet-action/);
  await expect(action.locator('xpath=..')).toHaveClass(/os-empty-action/);
}

/**
 * Mid-list live-list Retry — fixed chrome whisper, not in-flow empty action.
 * Keeps painted rows from jumping when append/search fails.
 */
export async function expectOsChromeWhisperRetry(
  action: Locator
): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/os-chrome-whisper-retry/);
  await expect(action.locator('xpath=../..')).toHaveClass(
    /os-chrome-whisper-anchor/
  );
}

/** Row chips (Play / Watch / View drop) share `.os-row-action` → borderless `sm`. */
export async function expectOsRowAction(action: Locator): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/os-sheet-action/);
  await expect(action.locator('xpath=..')).toHaveClass(/os-row-action/);
}

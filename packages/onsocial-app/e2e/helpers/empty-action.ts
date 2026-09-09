import { expect, type Locator } from '@playwright/test';

/** Page-empty recoveries share `.os-empty-action` → borderless `sm`. */
export async function expectOsEmptyAction(action: Locator): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/os-sheet-action/);
  await expect(action.locator('xpath=..')).toHaveClass(/os-empty-action/);
}

/** Row chips (Play / Watch / View drop) share `.os-row-action` → borderless `sm`. */
export async function expectOsRowAction(action: Locator): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toHaveClass(/os-sheet-action/);
  await expect(action.locator('xpath=..')).toHaveClass(/os-row-action/);
}

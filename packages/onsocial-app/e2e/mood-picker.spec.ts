import { expect, test } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import {
  E2E_CHROME_TIMEOUT_MS,
  expectPortfolioIdentityOrSkip,
  gotoApp,
} from './helpers';

const BUILT_IN_ROWS = [
  'Protocol',
  'Lead',
  'Business',
  'Noir',
  'Creative',
  'Celebration',
  'Build',
  'Journal',
] as const;

async function openMoodSheet(page: import('@playwright/test').Page) {
  const dockAccount = page
    .locator('.portfolio-summon-account[aria-haspopup="dialog"]')
    .first();
  await dockAccount.waitFor({
    state: 'visible',
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await dockAccount.click();
  const accountSheet = page.getByRole('dialog');
  await accountSheet.waitFor({
    state: 'visible',
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await page.getByRole('button', { name: /Account Profile, alerts/i }).click();
  const customizeBtn = page.getByRole('button', { name: /Customize page/i });
  await customizeBtn.waitFor({
    state: 'visible',
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await customizeBtn.click();
  const customizeSheet = page.getByRole('dialog', { name: /Customize/i });
  await customizeSheet.waitFor({
    state: 'visible',
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await customizeSheet.locator('.customize-mood-option').click();
  const moodSheet = page.getByRole('dialog', { name: /Moods/i });
  await moodSheet.waitFor({
    state: 'visible',
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  return moodSheet;
}

test.describe('mood picker', () => {
  test.beforeEach(async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}`);
    await expectPortfolioIdentityOrSkip(page);
  });

  test('lists every built-in mood and the premium store sections', async ({
    page,
  }) => {
    const moodSheet = await openMoodSheet(page);

    for (const label of BUILT_IN_ROWS) {
      await expect(
        moodSheet.getByRole('button', { name: new RegExp(`^${label}`) })
      ).toBeVisible();
    }
    for (const title of [
      'Presence',
      'Expression',
      'Voice',
      'Finishes',
      'Voices',
    ]) {
      await expect(
        moodSheet.getByText(title, { exact: true })
      ).toBeVisible();
    }
    await expect(
      moodSheet.getByRole('button', { name: /^Terminal/ })
    ).toBeVisible();

    // Expired seasonal moods stay hidden.
    await expect(
      moodSheet.getByRole('button', { name: /^Summer/ })
    ).toHaveCount(0);
  });

  test('each row renders in its own mood with a readable accent', async ({
    page,
  }) => {
    const moodSheet = await openMoodSheet(page);
    const noirRow = moodSheet.getByRole('button', { name: /^Noir/ });
    const accent = await noirRow.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--mood-preset-accent').trim()
    );
    expect(accent).toBeTruthy();

    await page.emulateMedia({ colorScheme: 'light' });
    const accentLight = await noirRow.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--mood-preset-accent-light').trim()
    );
    expect(accentLight).toBeTruthy();
    expect(accentLight).not.toBe(accent);
  });

  test('tapping a mood opens live preview with cancel returning to the sheet', async ({
    page,
  }) => {
    const moodSheet = await openMoodSheet(page);
    await moodSheet.getByRole('button', { name: /^Noir/ }).click();

    const bar = page.locator('.portfolio-mood-preview-bar');
    await bar.waitFor({ state: 'visible', timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(bar.getByRole('button', { name: /Cancel/i })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Save/i })).toBeVisible();

    await bar.getByRole('button', { name: /Cancel/i }).click();
    await expect(
      page.getByRole('dialog', { name: /Moods/i })
    ).toBeVisible();
  });
});

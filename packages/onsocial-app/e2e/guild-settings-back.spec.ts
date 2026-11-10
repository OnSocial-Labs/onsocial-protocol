import { expect, test, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import { setE2eGraphGuild } from './helpers/e2e-graph';
import {
  GUILD_E2E_PATH,
  GUILD_E2E_TITLE,
  stubGuildPage,
} from './helpers/guild-page';

const SETTINGS = `${GUILD_E2E_PATH}?sheet=settings`;
const PROPOSALS = `${GUILD_E2E_PATH}?sheet=proposals`;

async function readyGuild(page: Page) {
  await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
  await setE2eGraphGuild(page, 'owner');
  await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
  await gotoApp(page, '/');
  await gotoApp(page, GUILD_E2E_PATH);
  await expect(
    page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
  ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
}

async function mark(page: Page, label: string) {
  const historyLength = await page.evaluate(() => history.length);
  const current = new URL(page.url());
  const url = current.pathname + current.search;
  console.log(`BACK_STEP ${label} historyLength=${historyLength} url=${url}`);
  return { historyLength, url };
}

test('history back from proposals opened from settings', async ({ page }) => {
  await readyGuild(page);
  expect(await mark(page, 'guild')).toEqual({
    historyLength: 3,
    url: GUILD_E2E_PATH,
  });
  await page.getByRole('button', { name: 'Guild settings' }).click();
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));
  expect(await mark(page, 'settings')).toEqual({
    historyLength: 3,
    url: SETTINGS,
  });
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /Proposals/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`${GUILD_E2E_PATH}\\?sheet=proposals$`)
  );
  expect(await mark(page, 'proposals')).toEqual({
    historyLength: 4,
    url: PROPOSALS,
  });
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));
  expect(await mark(page, 'after-proposals-back')).toEqual({
    historyLength: 4,
    url: SETTINGS,
  });
});

test('one history back after proposals close leaves the guild', async ({
  page,
}) => {
  await readyGuild(page);
  expect(await mark(page, 'guild')).toEqual({
    historyLength: 3,
    url: GUILD_E2E_PATH,
  });
  await page.getByRole('button', { name: 'Guild settings' }).click();
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));
  expect(await mark(page, 'settings')).toEqual({
    historyLength: 3,
    url: SETTINGS,
  });
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /Proposals/ }).click();
  const proposals = page.getByRole('dialog', { name: 'Proposals' });
  await expect(proposals).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${GUILD_E2E_PATH}\\?sheet=proposals$`)
  );
  expect(await mark(page, 'proposals')).toEqual({
    historyLength: 4,
    url: PROPOSALS,
  });
  await proposals.getByRole('button', { name: 'Close' }).click();
  await expect(proposals).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));
  expect(await mark(page, 'after-close')).toEqual({
    historyLength: 4,
    url: SETTINGS,
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await mark(page, 'after-back')).toEqual({
    historyLength: 4,
    url: '/',
  });
});

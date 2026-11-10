import { mkdirSync, writeFileSync } from 'node:fs';
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

async function mark(page: Page) {
  const historyLength = await page.evaluate(() => history.length);
  const url = new URL(page.url());
  return { historyLength, url: url.pathname + url.search };
}

function save(name: string, record: unknown) {
  const dir = process.env.BACK_CHECK_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(record, null, 2));
}

test('history back from proposals opened from settings', async ({ page }) => {
  await readyGuild(page);
  await page.getByRole('button', { name: 'Guild settings' }).click();
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /Proposals/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`${GUILD_E2E_PATH}\\?sheet=proposals$`)
  );
  const before = await mark(page);
  await page.goBack();
  await expect(page).not.toHaveURL(/sheet=proposals/);
  const after = await mark(page);
  save('proposals-history-back', { before, after });
});

test('one history back after proposals close leaves the guild', async ({
  page,
}) => {
  await readyGuild(page);
  await page.getByRole('button', { name: 'Guild settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /Proposals/ }).click();
  const proposals = page.getByRole('dialog', { name: 'Proposals' });
  await expect(proposals).toBeVisible();
  await proposals.getByRole('button', { name: 'Close' }).click();
  await expect(proposals).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`${GUILD_E2E_PATH}(?:\\?sheet=settings)?$`)
  );
  const afterClose = await mark(page);
  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(GUILD_E2E_PATH));
  const afterBack = await mark(page);
  expect(afterBack.url).not.toContain(GUILD_E2E_PATH);
  save('close-then-history-back', { afterClose, afterBack });
});

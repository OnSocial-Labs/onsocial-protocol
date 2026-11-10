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

function place(href: string) {
  if (href.startsWith('about:')) return href;
  const current = new URL(href);
  return current.pathname + current.search;
}

async function read(page: Page) {
  const historyLength = await page.evaluate(() => history.length);
  return { historyLength, url: place(page.url()) };
}

function logStep(label: string, snap: { historyLength: number; url: string }) {
  console.log(
    `FAST_HISTORY ${label} historyLength=${snap.historyLength} url=${snap.url}`
  );
}

// Current behaviour. A fast close still leaves the same history shape as
// 673dff47, including the extra settings entry. A follow-up will change that.
test('current fast-close history, deferred to a follow-up', async ({
  page,
}) => {
  await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
  await setE2eGraphGuild(page, 'owner');
  await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
  await gotoApp(page, GUILD_E2E_PATH);
  await expect(
    page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
  ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

  await page.getByRole('button', { name: 'Guild settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings$`));

  await settings
    .getByRole('button', { name: /Proposals/ })
    .evaluate((node: HTMLElement) => node.click());
  const proposals = page.getByRole('dialog', { name: 'Proposals' });
  await expect(proposals).toBeVisible();
  const before = await read(page);
  const kind =
    before.url === SETTINGS && before.historyLength === 2
      ? 'fast'
      : before.url === PROPOSALS && before.historyLength === 3
        ? 'slow'
        : 'other';
  logStep(`pre-close kind=${kind}`, before);
  if (kind === 'other') {
    throw new Error(
      `unexpected pre-close historyLength=${before.historyLength} url=${before.url}`
    );
  }

  await proposals
    .getByRole('button', { name: 'Close', exact: true })
    .evaluate((node: HTMLElement) => node.click());
  await expect
    .poll(async () => {
      const snap = await read(page);
      const visible = await page
        .getByRole('dialog', { name: 'Settings' })
        .isVisible()
        .catch(() => false);
      return `${snap.historyLength}|${snap.url}|${visible}`;
    })
    .toBe(`3|${SETTINGS}|true`);
  const after = await read(page);
  logStep('after-close', after);
  expect(after).toEqual({ historyLength: 3, url: SETTINGS });

  await page.goBack({ waitUntil: 'commit' });
  await expect.poll(async () => (await read(page)).url).toBe('about:blank');
  const afterBack = await read(page);
  logStep('after-back', afterBack);
  expect(afterBack).toEqual({ historyLength: 3, url: 'about:blank' });
});

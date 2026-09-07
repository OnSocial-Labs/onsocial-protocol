import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import {
  GUILD_E2E_EMPTY_FEED,
  GUILD_E2E_PATH,
  GUILD_E2E_STORED_NAME,
  GUILD_E2E_TITLE,
  stubGuildPage,
} from './helpers/guild-page';

test.describe('guild page', () => {
  test('guest paints a cleaned hero and Connect, not Connect wallet', async ({
    page,
  }) => {
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.locator('.guild-hero-title-row h2')).toHaveText(
      GUILD_E2E_TITLE
    );
    await expect(page.getByText(GUILD_E2E_STORED_NAME)).toHaveCount(0);
    await expect(page.locator('.guild-hero-mode')).toHaveText('Open');
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible();
    await expect(page.getByText(GUILD_E2E_EMPTY_FEED)).toBeVisible();

    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.locator('.guild-hero-membership').getByRole('button', { name: 'Connect' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild settings' })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(0);
  });

  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubGuildPage(page, { catalogDelayMs: 2500 });
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(page.locator('[data-guild-page-skeleton]').first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(GUILD_E2E_EMPTY_FEED)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-guild-page-skeleton]')).toHaveCount(0);
    await expect(page.getByText(GUILD_E2E_EMPTY_FEED)).toBeVisible();
  });

  test('member sees Joined and the guild menu, not settings', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      page.locator('.guild-hero-membership').getByRole('button', { name: 'Joined' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild settings' })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0);
  });

  test('owner keeps settings and add-room chrome', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      page.locator('.guild-hero-membership').getByRole('button', { name: 'Joined' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.getByRole('button', { name: 'Guild settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add room' })).toBeVisible();
  });

  test('facts sheet opens from the hero info control', async ({ page }) => {
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page.getByRole('button', { name: 'Guild facts' }).click();
    const facts = page.getByRole('dialog', { name: GUILD_E2E_TITLE });
    await expect(facts).toBeVisible();
    await expect(
      facts.getByText('Anyone can join and post. Activity stays public.')
    ).toBeVisible();
    await expect(facts.getByText(/1 member/)).toBeVisible();
  });

  test('re-tapping an active room opens room facts', async ({ page }) => {
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page.getByRole('button', { name: 'General' }).click();
    await expect(
      page.getByRole('button', { name: 'General, room details' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'General, room details' }).click();
    const roomFacts = page.getByRole('dialog', { name: 'General' });
    await expect(roomFacts).toBeVisible();
    await expect(roomFacts.getByText('Everyone here')).toBeVisible();
  });

  test('members sheet deep link opens the roster', async ({ page }) => {
    await stubGuildPage(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=members`);

    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(members.getByRole('heading', { name: 'Members' })).toBeVisible();
  });

  test('document title includes Guilds · OnSocial', async ({ page }) => {
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(page).toHaveTitle(/Guilds • OnSocial/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
  });
});

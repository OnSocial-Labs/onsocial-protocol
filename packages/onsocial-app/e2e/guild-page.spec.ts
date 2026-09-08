import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import { setE2eGraphGuild } from './helpers/e2e-graph';
import {
  GUILD_E2E_BANNED_HINT,
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
    await setE2eGraphGuild(page, 'empty');
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
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await expect(rooms).toBeVisible();
    await expect(rooms.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(rooms.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
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

  test('SSR catalog hit paints Audit Guild without the skeleton', async ({
    page,
  }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(page.locator('[data-guild-page-skeleton]')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible();
    await expect(page.getByText(GUILD_E2E_STORED_NAME)).toHaveCount(0);
    await expect(page.getByText(GUILD_E2E_EMPTY_FEED)).toBeVisible();
  });

  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubGuildPage(page, { catalogDelayMs: 2500 });
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(page.locator('[data-guild-page-skeleton]').first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.locator('[data-guild-page-skeleton] [data-guild-room-rail-skeleton]')
    ).toBeVisible();
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
    await setE2eGraphGuild(page, 'member');
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

  test('banned viewer sees Banned and why, not Join', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'banned');
    await stubGuildPage(page, { bannedId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const membership = page.locator('.guild-hero-membership');
    await expect(
      membership.getByRole('button', { name: 'Banned' })
    ).toBeDisabled();
    await expect(membership.getByRole('button', { name: 'Join' })).toHaveCount(
      0
    );
    await expect(page.getByText(GUILD_E2E_BANNED_HINT)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Guild settings' })
    ).toHaveCount(0);
  });

  test('owner keeps settings and add-room chrome', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'owner');
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
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await expect(rooms.getByRole('button', { name: 'Add room' })).toBeVisible();
    await expect(rooms.getByRole('tab', { name: 'Add room' })).toHaveCount(0);
  });

  test('facts sheet opens from the hero info control', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page.getByRole('button', { name: 'Guild facts' }).click();
    const facts = page.getByRole('dialog', { name: GUILD_E2E_TITLE });
    await expect(facts).toBeVisible();
    await expect(facts.getByText(GUILD_E2E_STORED_NAME)).toHaveCount(0);
    await expect(
      facts.getByText('Anyone can join and post. Activity stays public.')
    ).toBeVisible();
    await expect(facts.getByText(/1 member/)).toBeVisible();
  });

  test('re-tapping an active room opens room facts', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page.getByRole('tab', { name: 'General' }).click();
    await expect(
      page.getByRole('tab', { name: 'General, room details' })
    ).toBeVisible();
    await page.getByRole('tab', { name: 'General, room details' }).click();
    const roomFacts = page.getByRole('dialog', { name: 'General' });
    await expect(roomFacts).toBeVisible();
    await expect(roomFacts.getByText('Everyone here')).toBeVisible();
  });

  test('members sheet deep link opens the roster', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=members`);

    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(members.getByRole('heading', { name: 'Members' })).toBeVisible();
  });

  test('legacy /members redirects onto the members sheet', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, `${GUILD_E2E_PATH}/members`);

    await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}\\?sheet=members`));
    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(members.getByRole('heading', { name: 'Members' })).toBeVisible();
  });

  test('owner /settings redirects onto the settings hub', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'owner');
    await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, `${GUILD_E2E_PATH}/settings`);

    await expect(page).toHaveURL(
      new RegExp(`${GUILD_E2E_PATH}\\?sheet=settings`)
    );
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      settings.getByRole('button', { name: /Edit guild/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Rooms and feed tabs/ })
    ).toBeVisible();
  });

  test('document title includes Guilds · OnSocial', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(page).toHaveTitle(/Guilds • OnSocial/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
  });
});

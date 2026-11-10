import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import {
  seedE2eMockSigner,
  stubNearRpcTxFinal,
} from './helpers/e2e-mock-signer';
import { setE2eGraphGuild } from './helpers/e2e-graph';
import {
  GUILD_E2E_BANNED_HINT,
  GUILD_E2E_EMPTY_FEED,
  GUILD_E2E_FEED_ROWS,
  GUILD_E2E_FEED_TEXT,
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
    await expect(
      page.getByRole('button', { name: 'Share the first post' })
    ).toHaveCount(0);

    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    const joinIcon = page.getByRole('button', { name: 'Join guild' });
    await expect(joinIcon).toBeEnabled();
    await expect(joinIcon).toHaveCSS('cursor', 'pointer');
    await joinIcon.hover();
    await expect(joinIcon).toHaveCSS('cursor', 'pointer');
    await expect(
      page.getByRole('button', { name: 'Guild settings' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Leave guild' })).toHaveCount(
      0
    );
  });

  test('connected viewer joins from the plus icon, with no Join label', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    const joinIcon = page.getByRole('button', { name: 'Join guild' });
    await expect(joinIcon).toBeEnabled({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(joinIcon).toHaveCSS('cursor', 'pointer');
    await expect(
      page.getByRole('button', { name: 'Join', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Guild settings' })
    ).toHaveCount(0);
    await joinIcon.click();
    const confirm = page.getByRole('dialog', { name: 'Join' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Join' })).toBeVisible();
  });

  test('a gated guild still joins from the plus, with no Request label', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page, { accessGated: true });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(page.getByRole('button', { name: 'Join guild' })).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: 'Request' })).toHaveCount(0);
    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    await page.getByRole('button', { name: 'Join guild' }).click();
    const confirm = page.getByRole('dialog', { name: 'Ask to join' });
    await expect(confirm).toBeVisible();
    await expect(
      confirm.getByRole('button', { name: 'Ask to join' })
    ).toBeVisible();
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
    await expect(
      page.locator('[data-guild-page-skeleton]').first()
    ).toBeVisible({
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

  test('preserves painted feed rows while a room refresh is pending', async ({
    page,
  }) => {
    await stubGuildPage(page, {
      feedRows: GUILD_E2E_FEED_ROWS,
      feedRefreshDelayMs: 2500,
    });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(page.getByText(GUILD_E2E_FEED_TEXT)).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await page.getByRole('tab', { name: 'General' }).click();
    await expect(page.locator('.home-feed-list.is-refreshing')).toBeVisible();
    await expect(page.getByText(GUILD_E2E_FEED_TEXT)).toBeVisible();
  });

  test('shows a feed refresh error over painted rows', async ({ page }) => {
    await stubGuildPage(page, {
      feedRows: GUILD_E2E_FEED_ROWS,
      feedErrorOnce: true,
    });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(page.getByText(GUILD_E2E_FEED_TEXT)).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await page.getByRole('tab', { name: 'General' }).click();
    const feedError = page
      .getByRole('alert')
      .filter({ hasText: 'Guild posts could not refresh' });
    await expect(feedError).toBeVisible();
    await expect(page.getByText(GUILD_E2E_FEED_TEXT)).toBeVisible();
  });

  test('member sees Joined, leave, and proposals inside settings', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(
      0
    );
    const leaveIcon = page.getByRole('button', { name: 'Leave guild' });
    await expect(leaveIcon).toBeEnabled();
    await expect(leaveIcon).toHaveCSS('cursor', 'pointer');
    const chipGap = await page
      .locator('.guild-feed-filter-list')
      .evaluate((node) => getComputedStyle(node).gap);
    await expect(page.locator('.guild-hero-meta-end')).toHaveCSS(
      'gap',
      chipGap
    );
    await expect(page.locator('.guild-hero-actions')).toHaveCSS('gap', chipGap);
    const restColor = await leaveIcon.evaluate(
      (node) => getComputedStyle(node).color
    );
    const alpha = (value: string) =>
      Number(value.match(/[\d.]+(?=\))/)?.[0] ?? 0);
    await leaveIcon.hover();
    await expect
      .poll(async () =>
        alpha(await leaveIcon.evaluate((node) => getComputedStyle(node).color))
      )
      .toBeGreaterThan(alpha(restColor));
    const hoverFill = await leaveIcon.evaluate(
      (node) => getComputedStyle(node).backgroundColor
    );
    expect(alpha(hoverFill)).toBe(0);
    await expect(leaveIcon).toHaveCSS('cursor', 'pointer');
    await leaveIcon.evaluate((node) => node.classList.add('is-pending'));
    await expect(leaveIcon).toHaveCSS('cursor', 'progress');
    await leaveIcon.evaluate((node) => node.classList.remove('is-pending'));
    const leaveGlyph = leaveIcon.locator('.glass-sheet-close-icon');
    /* --os-chrome-glyph-size 1.5rem */
    await expect(leaveGlyph).toHaveCSS('width', '24px');
    await expect(leaveGlyph).toHaveCSS('height', '24px');
    await expect(page.getByRole('button', { name: 'Join guild' })).toHaveCount(
      0
    );
    await expect(page.locator('.guild-nav-settings')).toHaveCount(0);
    const settingsButton = page.getByRole('button', { name: 'Guild settings' });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Proposals/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Edit guild/ })
    ).toHaveCount(0);
    await expect(settings.getByRole('button', { name: /^Rooms/ })).toHaveCount(
      0
    );
    await expect(
      settings.getByRole('button', { name: /Guild storage/ })
    ).toHaveCount(0);
    await expect(
      settings.getByRole('button', { name: /Member requests/ })
    ).toHaveCount(0);
    await settings.getByRole('button', { name: 'Close' }).click();
    await expect(settings).toHaveCount(0);
    await page.getByRole('button', { name: /View roster/ }).click();
    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible();
    await expect(
      members.getByRole('button', { name: 'Add member' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0);
  });

  test('member with an empty feed gets a compose cue', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(page.getByText(GUILD_E2E_EMPTY_FEED)).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    const cue = page.getByRole('button', { name: 'Share the first post' });
    await expect(cue).toBeVisible();
    await cue.click();
    const composer = page.getByRole('dialog', { name: 'New post' });
    await expect(composer).toBeVisible();
    await expect(
      composer.getByText(GUILD_E2E_TITLE, { exact: true })
    ).toBeVisible();
    await expect(
      composer.getByRole('button', { name: 'Room General' })
    ).toBeVisible();
    if (process.env.E2E_WALKTHROUGH_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/guild-compose-destination.png`,
      });
    }
    await composer.getByRole('button', { name: 'Room General' }).click();
    const rooms = page.getByRole('dialog', { name: 'Room' });
    await expect(
      rooms.getByRole('option', { name: 'General' })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('banned viewer sees Banned and why, not Join', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'banned');
    await stubGuildPage(page, { bannedId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Banned' })).toHaveCount(0);
    const joinIcon = page.getByRole('button', { name: 'Join guild' });
    await expect(joinIcon).toBeDisabled();
    await expect(joinIcon).toHaveCSS('cursor', 'default');
    await expect(page.getByText(GUILD_E2E_BANNED_HINT)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Guild settings' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Leave guild' })).toHaveCount(
      0
    );
  });

  test('owner keeps settings and add-room chrome', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'owner');
    await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.locator('.guild-hero-membership')).toHaveCount(0);
    const settingsButton = page.getByRole('button', { name: 'Guild settings' });
    await expect(settingsButton).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(page.locator('.guild-nav-settings')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guild menu' })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Leave guild' })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Join guild' })).toHaveCount(
      0
    );
    const gear = settingsButton.locator('.glass-sheet-close-icon');
    /* --os-chrome-glyph-size 1.5rem */
    await expect(gear).toHaveCSS('width', '24px');
    await expect(gear).toHaveCSS('height', '24px');
    await page.getByRole('button', { name: /View roster/ }).click();
    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible();
    const trail = members
      .locator('.guild-member-row .drops-discovery-head-trail')
      .first();
    await expect(trail.locator('.market-listing-meta-right')).toBeVisible();
    await expect(trail.locator('.post-card-menu-trigger')).toBeVisible();
    const aligned = await trail.evaluate((el) => {
      const time = el.querySelector('time');
      const button = el.querySelector('.post-card-menu-trigger');
      const icon = el.querySelector('.post-card-menu-icon');
      const name = el
        .closest('.guild-member-row')
        ?.querySelector('.standing-row-name');
      if (!time || !button || !icon || !name) return null;
      const timeBox = time.getBoundingClientRect();
      const menuBox = button.getBoundingClientRect();
      const nameBox = name.getBoundingClientRect();
      const mid = (box: DOMRect) => box.top + box.height / 2;
      const buttonCs = getComputedStyle(button);
      const iconCs = getComputedStyle(icon);
      return {
        stampMenu: Math.abs(mid(timeBox) - mid(menuBox)),
        nameMenu: Math.abs(mid(nameBox) - mid(menuBox)),
        menuAfterStamp: menuBox.left > timeBox.right - 1,
        menuWidth: Number.parseFloat(buttonCs.width),
        menuHeight: Number.parseFloat(buttonCs.height),
        iconWidth: Number.parseFloat(iconCs.width),
      };
    });
    expect(aligned).toBeTruthy();
    expect(aligned!.stampMenu).toBeLessThan(1);
    expect(aligned!.nameMenu).toBeLessThan(2);
    expect(aligned!.menuAfterStamp).toBe(true);
    /* Inline ⋮ — --os-menu-hit-size 1.35rem / --os-menu-glyph-size 1.125rem. */
    expect(aligned!.menuWidth).toBeGreaterThan(21);
    expect(aligned!.menuWidth).toBeLessThan(22.5);
    expect(aligned!.menuHeight).toBeGreaterThan(21);
    expect(aligned!.menuHeight).toBeLessThan(22.5);
    expect(aligned!.iconWidth).toBeGreaterThan(17.5);
    expect(aligned!.iconWidth).toBeLessThan(18.5);
    const addMemberButton = members.getByRole('button', { name: 'Add member' });
    const addMemberGlyph = addMemberButton.locator('svg');
    /* --os-chrome-glyph-size 1.5rem */
    await expect(addMemberGlyph).toHaveCSS('width', '24px');
    await expect(addMemberGlyph).toHaveCSS('height', '24px');
    await addMemberButton.click();
    const addMember = page.getByRole('dialog', { name: 'Add member' });
    await expect(addMember).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`${GUILD_E2E_PATH}\\?sheet=members`)
    );
    await expect(
      addMember.getByText('Search profiles to invite.')
    ).toBeVisible();
    // Add member nests on Members (enter) — Members stays mounted underneath.
    await expect(members).toBeVisible();
    await expect(addMember).toBeVisible();
    if (process.env.E2E_WALKTHROUGH_DIR) {
      await addMember.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/guild-add-member-sheet.png`,
      });
    }
    await addMember.getByRole('button', { name: 'Close add member' }).click();
    await expect(addMember).toHaveCount(0);
    await expect(members).toBeVisible();
    await members.getByRole('button', { name: 'Close members' }).click();
    await expect(members).toHaveCount(0);
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await expect(rooms.getByRole('button', { name: 'Add room' })).toBeVisible();
    await expect(rooms.getByRole('tab', { name: 'Add room' })).toHaveCount(0);
    await settingsButton.click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    const closedItself = settings
      .waitFor({ state: 'hidden', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    await expect(
      settings.getByRole('button', { name: /Member requests/ })
    ).toHaveCount(0);
    await expect(
      settings.getByRole('button', { name: /Proposals/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Edit guild/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /^Rooms/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Guild storage/ })
    ).toBeVisible();
    await expect(settings.getByText('Analytics')).toHaveCount(0);
    await expect(settings.getByText('Soon')).toHaveCount(0);
    expect(await closedItself).toBe(false);
    await expect(settings).toBeVisible();
  });

  test('owner add-room sheet picks share policy from a choice drawer', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'owner');
    await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await rooms.getByRole('button', { name: 'Add room' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add room' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Adds a visible feed tab')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Feed tab/ })).toHaveCount(
      0
    );
    const shareChip = sheet.getByRole('button', {
      name: 'Who can share: Everyone here',
    });
    await expect(shareChip).toBeVisible();
    const name = sheet.getByRole('textbox', { name: 'Name' });
    await name.fill('Shipping Room');
    await expect(name).toHaveValue('Shipping Room');
    await expect(
      sheet.getByRole('button', { name: 'Add room', exact: true })
    ).toBeEnabled();
    await shareChip.click();

    const shareDialog = page.getByRole('dialog', { name: 'Who can share' });
    await expect(shareDialog).toHaveAttribute('data-presentation', 'appear');
    await expect(shareDialog).toHaveAttribute('data-stack-op', 'cover');
    await expect(sheet).toHaveAttribute('data-presentation', 'enter');
    await expect(sheet).toHaveAttribute('data-stack-op', 'present');
    const share = page.getByRole('listbox', { name: 'Who can share' });
    const everyone = share.getByRole('option', { name: /Everyone here/ });
    const team = share.getByRole('option', { name: /From the team/ });
    const leaders = share.getByRole('option', { name: /Leaders only/ });
    const selected = share.getByRole('option', { name: /Selected members/ });
    await expect(everyone).toHaveAttribute('aria-selected', 'true');
    await expect(team).toHaveAttribute('aria-selected', 'false');
    await expect(leaders).toHaveAttribute('aria-selected', 'false');
    await expect(selected).toHaveAttribute('aria-selected', 'false');
    await expect(
      page
        .getByRole('dialog', { name: 'Who can share' })
        .getByText('Who may post in this room')
    ).toBeVisible();
    await expect(everyone.getByText('Any member can share')).toBeVisible();

    await leaders.click();
    await expect(
      sheet.getByRole('button', { name: 'Who can share: Leaders only' })
    ).toBeVisible();

    await sheet
      .getByRole('button', { name: 'Who can share: Leaders only' })
      .click();
    await page
      .getByRole('listbox', { name: 'Who can share' })
      .getByRole('option', { name: /Selected members/ })
      .click();
    await expect(
      sheet.getByRole('button', { name: 'Who can share: Selected members' })
    ).toBeVisible();
    await expect(name).toHaveValue('Shipping Room');
    await expect(
      sheet.getByRole('button', { name: 'Add room', exact: true })
    ).toBeEnabled();
    await sheet.getByRole('button', { name: 'Close add room' }).click();
    const discard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(discard).toBeVisible();
    await expect(discard).toHaveAttribute('data-presentation', 'appear');
    await expect(discard).toHaveAttribute('data-stack-op', 'cover');
    await discard
      .locator('button.os-sheet-action', { hasText: 'Keep editing' })
      .click();
    await expect(discard).toHaveCount(0);
    await expect(name).toHaveValue('Shipping Room');
    if (process.env.E2E_WALKTHROUGH_DIR) {
      await expect(sheet).not.toHaveClass(/glass-sheet-panel--enter/);
      await sheet.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/feed-add-room-editor.png`,
      });
    }
  });

  test('feed add room confirms discard when only share policy changed', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'owner');
    await stubGuildPage(page, { ownerId: COLLECTIBLES_VAULT_OWNER });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await rooms.getByRole('button', { name: 'Add room' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add room' });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('button', { name: 'Who can share: Everyone here' })
      .click();
    await page
      .getByRole('listbox', { name: 'Who can share' })
      .getByRole('option', { name: /Leaders only/ })
      .click();
    await expect(
      sheet.getByRole('button', { name: 'Who can share: Leaders only' })
    ).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('');

    await sheet.getByRole('button', { name: 'Close add room' }).click();
    const discard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(discard).toBeVisible();
    await discard
      .locator('button.os-sheet-action', { hasText: 'Discard' })
      .click();
    await expect(sheet).toHaveCount(0);
  });

  test('feed add room saves on chain and paints a new feed tab', async ({
    page,
  }) => {
    await seedE2eMockSigner(page, COLLECTIBLES_VAULT_OWNER, { succeed: true });
    await stubNearRpcTxFinal(page);
    await setE2eGraphGuild(page, 'owner');
    await stubGuildPage(page, {
      ownerId: COLLECTIBLES_VAULT_OWNER,
      persistFeedRoomOnRelay: true,
    });
    await gotoApp(page, GUILD_E2E_PATH);

    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const rooms = page.getByRole('tablist', { name: 'Guild rooms' });
    await rooms.getByRole('button', { name: 'Add room' }).click();

    const sheet = page.getByRole('dialog', { name: 'Add room' });
    await sheet.getByRole('textbox', { name: 'Name' }).fill('Shipping Room');
    await sheet
      .getByRole('button', { name: 'Who can share: Everyone here' })
      .click();
    await page
      .getByRole('listbox', { name: 'Who can share' })
      .getByRole('option', { name: /Leaders only/ })
      .click();
    await sheet.getByRole('button', { name: 'Add room', exact: true }).click();

    await expect(sheet).toHaveCount(0, { timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(rooms.getByRole('tab', { name: 'Shipping Room' })).toBeVisible(
      {
        timeout: E2E_CHROME_TIMEOUT_MS,
      }
    );
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
    await expect(
      members.getByRole('heading', { name: 'Members' })
    ).toBeVisible();
  });

  test('legacy /members redirects onto the members sheet', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, `${GUILD_E2E_PATH}/members`);

    await expect(page).toHaveURL(
      new RegExp(`${GUILD_E2E_PATH}\\?sheet=members`)
    );
    const members = page.getByRole('dialog', { name: 'Members' });
    await expect(members).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      members.getByRole('heading', { name: 'Members' })
    ).toBeVisible();
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
      settings.getByRole('button', { name: /Proposals/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Edit guild/ })
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: /Rooms and feed tabs/ })
    ).toBeVisible();
  });

  test('settings handoff opens proposals and guild storage as slide drawers', async ({
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

    await settings.getByRole('button', { name: /Proposals/ }).click();
    const proposals = page.getByRole('dialog', { name: 'Proposals' });
    await expect(proposals).toBeVisible();
    await expect(proposals).toHaveAttribute('data-presentation', 'enter');
    await expect(proposals).toHaveAttribute('data-stack-op', 'replace');
    await proposals.getByRole('button', { name: 'Close' }).click();
    await expect(proposals).toHaveCount(0);

    // Closing proposals pops back to Settings when it owned the prior URL.
    // A closing sheet still has a box, so wait until Settings is painted.
    // Prefer the hero control (`exact`) — backdrop is "Close guild settings".
    const settingsAgain = page.getByRole('dialog', { name: 'Settings' });
    const settingsPainted = async () =>
      (await settingsAgain.count()) > 0 &&
      (await settingsAgain.evaluate((el) => getComputedStyle(el).opacity)) ===
        '1';
    if (!(await settingsPainted())) {
      await expect(settingsAgain).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Guild settings', exact: true })
        .click();
    }
    await expect(settingsAgain).toBeVisible();
    await expect(settingsAgain).toHaveCSS('opacity', '1');
    await settingsAgain.getByRole('button', { name: /Guild storage/ }).click();
    const storage = page.getByRole('dialog', { name: 'Guild storage' });
    await expect(storage).toBeVisible();
    await expect(storage).toHaveAttribute('data-presentation', 'enter');
    await expect(storage).toHaveAttribute('data-stack-op', 'replace');
  });

  test('rooms editor adds a draft room and confirms before discard', async ({
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
    await settings.getByRole('button', { name: /Rooms and feed tabs/ }).click();

    const rooms = page.getByRole('dialog', { name: 'Rooms' });
    await expect(rooms).toBeVisible();
    await expect(rooms).toHaveAttribute('data-presentation', 'enter');
    await expect(rooms).toHaveAttribute('data-stack-op', 'replace');
    await expect(rooms.locator('.guild-structure-add')).toHaveCount(0);
    await expect(rooms.getByRole('textbox')).toHaveCount(0);
    await rooms.getByRole('button', { name: '+ Announcements' }).click();
    const fromLibrary = page.getByRole('dialog', { name: 'Add room' });
    await expect(fromLibrary).toBeVisible();
    const announcementsRow = rooms
      .locator('.guild-structure-room-list')
      .locator('button.os-surface-row', { hasText: 'Announcements' });
    await expect(announcementsRow).toHaveCount(0);
    await expect(
      rooms.getByRole('button', { name: '+ Announcements' })
    ).toBeVisible();
    await fromLibrary
      .getByRole('button', { name: 'Add room', exact: true })
      .click();
    await expect(fromLibrary).toHaveCount(0);
    await expect(announcementsRow).toBeVisible();
    await expect(
      rooms.getByRole('button', { name: '+ Announcements' })
    ).toHaveCount(0);

    await rooms.getByRole('button', { name: 'Add room', exact: true }).click();

    const editor = page.getByRole('dialog', { name: 'Add room' });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-presentation', 'enter');
    await expect(editor).toHaveAttribute('data-stack-op', 'push');
    await expect(editor.getByText('New feed tab')).toBeVisible();
    await expect(
      editor.getByRole('button', { name: 'Who can share: Everyone here' })
    ).toBeVisible();
    await expect(
      editor.getByRole('button', { name: 'Feed tab: In feed' })
    ).toBeVisible();
    await editor.getByRole('textbox').fill('Shipping Room');
    await editor.getByRole('button', { name: 'Feed tab: In feed' }).click();
    const feedTab = page.getByRole('dialog', { name: 'Feed tab' });
    await expect(feedTab).toHaveAttribute('data-presentation', 'appear');
    await expect(feedTab).toHaveAttribute('data-stack-op', 'cover');
    await feedTab.getByRole('option', { name: /In feed/ }).click();
    await expect(feedTab).toHaveCount(0);
    await expect(editor.getByRole('textbox')).toHaveValue('Shipping Room');
    await editor.getByRole('button', { name: 'Close add room' }).click();
    const abandon = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(abandon).toBeVisible();
    await expect(abandon).toHaveAttribute('data-presentation', 'appear');
    await expect(abandon).toHaveAttribute('data-stack-op', 'cover');
    await abandon
      .locator('button.os-sheet-action', { hasText: 'Keep editing' })
      .click();
    await expect(abandon).toHaveCount(0);
    await expect(editor.getByRole('textbox')).toHaveValue('Shipping Room');
    if (process.env.E2E_WALKTHROUGH_DIR) {
      await expect(editor).not.toHaveClass(/glass-sheet-panel--enter/);
      await editor.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/settings-add-room-editor.png`,
      });
    }
    await editor.getByRole('button', { name: 'Add room', exact: true }).click();

    await expect(editor).toHaveCount(0);
    await expect(
      rooms.getByRole('button', { name: /^Shipping Room/ })
    ).toBeVisible();

    await rooms.getByRole('button', { name: /^Shipping Room/ }).click();
    const room = page.getByRole('dialog', { name: 'Room', exact: true });
    await expect(room).toBeVisible();
    await expect(room.getByRole('textbox')).toHaveValue('Shipping Room');
    await room.getByRole('textbox').fill('Dock');
    await expect(
      rooms.getByRole('button', { name: /^Shipping Room/ })
    ).toBeVisible();
    await expect(rooms.getByRole('button', { name: /^Dock/ })).toHaveCount(0);
    await expect(
      room.getByRole('button', { name: 'Save', exact: true })
    ).toBeEnabled();
    await room.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(room).toHaveCount(0);
    await expect(rooms.getByRole('button', { name: /^Dock/ })).toBeVisible();
    await expect(
      rooms.getByRole('button', { name: /^Shipping Room/ })
    ).toHaveCount(0);

    await rooms.getByRole('button', { name: 'Move Dock earlier' }).click();
    await expect(rooms.getByRole('button', { name: /^Dock/ })).toBeVisible();
    await rooms.getByRole('button', { name: 'Move Dock later' }).click();

    await rooms.getByRole('button', { name: /^Dock/ }).click();
    const again = page.getByRole('dialog', { name: 'Room', exact: true });
    await expect(again).toHaveAttribute('data-presentation', 'enter');
    await expect(again).toHaveAttribute('data-stack-op', 'push');
    await expect(again.getByRole('button', { name: 'Arrange' })).toHaveCount(0);
    await again.getByRole('textbox').fill('Pier');
    await again.getByRole('button', { name: 'Close room' }).click();
    const roomDiscard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(roomDiscard).toBeVisible();
    await roomDiscard
      .locator('button.os-sheet-action', { hasText: 'Discard' })
      .click();
    await expect(again).toHaveCount(0);
    await expect(rooms.getByRole('button', { name: /^Dock/ })).toBeVisible();
    await expect(rooms.getByRole('button', { name: /^Pier/ })).toHaveCount(0);

    await rooms.getByRole('button', { name: 'Close', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(discard).toBeVisible();
    await expect(discard).toHaveAttribute('data-presentation', 'appear');
    await expect(discard).toHaveAttribute('data-stack-op', 'cover');
    await discard
      .locator('button.os-sheet-action', { hasText: 'Keep editing' })
      .click();
    await expect(discard).toHaveCount(0);
    await expect(rooms).toBeVisible();
    await expect(rooms).toHaveAttribute('data-presentation', 'enter');
    await expect(rooms).toHaveAttribute('data-stack-op', 'replace');
    await expect(rooms.getByRole('button', { name: /^Dock/ })).toBeVisible();
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

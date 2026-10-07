import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import { setE2eGraphGuild } from './helpers/e2e-graph';
import { GUILD_E2E_PATH, stubGuildPage } from './helpers/guild-page';
import { stubGuildProposals } from './helpers/guild-proposals';

test.describe('guild proposals sheet', () => {
  test('member sees governance cards with progress, own vote, and closed state', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    // Active role card: cleaned headline, reason, quorum-ready progress.
    const roleCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Bob Builder',
    });
    await expect(roleCard).toBeVisible();
    await expect(roleCard.getByText('Moderator')).toBeVisible();
    await expect(roleCard.getByText('Keeps the rooms tidy')).toBeVisible();
    // Identity: one shared clickable cluster; @id always shows for the
    // target and the proposer.
    await expect(
      roleCard.getByRole('link', { name: "View Bob Builder's profile" })
    ).toBeVisible();
    await expect(roleCard.getByText('@bob.testnet')).toBeVisible();
    await expect(roleCard.getByText('@alice.testnet')).toBeVisible();
    await expect(roleCard.getByText('3–1 · ready')).toBeVisible();
    await expect(
      roleCard.getByRole('button', { name: 'Support' })
    ).toBeVisible();
    await expect(
      roleCard.getByRole('button', { name: 'Oppose' })
    ).toBeVisible();
    // Public guild: every card carries a per-proposal share affordance.
    await expect(
      roleCard.getByRole('button', { name: 'Share proposal' })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Share proposal' })
    ).toHaveCount(4);

    // Room card: humanized room name, viewer vote acknowledged next to
    // the quorum readout, actions replaced.
    const roomCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Carol Creator',
    });
    await expect(
      roomCard.getByText('Allow to share in Announcements')
    ).toBeVisible();
    await expect(
      roomCard.getByText('You supported · 2/7 · need 2 more')
    ).toBeVisible();
    await expect(
      roomCard.getByRole('button', { name: 'Support' })
    ).toHaveCount(0);

    // Expired card: closed cue, final count, no failing vote actions —
    // a signed-in member gets the permissionless Resolve finalize instead.
    const expiredCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Dana Dao',
    });
    await expect(expiredCard.getByText('Voting closed')).toBeVisible();
    await expect(expiredCard.getByText('2/7 voted')).toBeVisible();
    await expect(
      expiredCard.getByRole('button', { name: 'Support' })
    ).toHaveCount(0);
    await expect(
      expiredCard.getByRole('button', { name: 'Oppose' })
    ).toHaveCount(0);
    await expect(
      expiredCard.getByRole('button', { name: 'Resolve' })
    ).toBeVisible();

    // Resolved section: outcome copy instead of actions.
    await expect(sheet.getByText('Recently resolved')).toBeVisible();
    const resolvedCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Erin Engineer',
    });
    await expect(resolvedCard.getByText('Approved')).toBeVisible();
    await expect(resolvedCard.getByText('Admin role applied.')).toBeVisible();
    await expect(
      resolvedCard.getByRole('button', { name: 'Support' })
    ).toHaveCount(0);
    // Resolved cards keep the roster toggle with the final count.
    await expect(
      resolvedCard.getByRole('button', { name: 'Votes · 6/7' })
    ).toBeVisible();
  });

  test('guest sees proposals but no vote actions', async ({ page }) => {
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await stubGuildProposals(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      sheet.getByText('Join this guild to vote on proposals.')
    ).toBeVisible();
    await expect(sheet.getByText('Bob Builder')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Support' })
    ).toHaveCount(0);
    // Resolve needs a wallet — guests only get the read-only roster.
    await expect(
      sheet.getByRole('button', { name: 'Resolve' })
    ).toHaveCount(0);
  });

  test('proposal deep link opens the sheet with the card focused', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals&proposal=11`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    // Sequence-number deep link focuses the matching card.
    const roomCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Carol Creator',
    });
    await expect(roomCard).toHaveClass(/guild-proposal-card--focused/);
    // The other cards stay unfocused.
    await expect(
      sheet.locator('.guild-proposal-card', { hasText: 'Bob Builder' })
    ).not.toHaveClass(/guild-proposal-card--focused/);
  });

  test('proposal deep link also matches the chain id for resolved cards', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(
      page,
      `${GUILD_E2E_PATH}?sheet=proposals&proposal=prop-resolved`
    );

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      sheet.locator('.guild-proposal-card', { hasText: 'Erin Engineer' })
    ).toHaveClass(/guild-proposal-card--focused/);
  });

  test('access-gated guild keeps proposals readable but hides share', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, {
      memberId: COLLECTIBLES_VAULT_OWNER,
      accessGated: true,
    });
    await stubGuildProposals(page, { accessGated: true });
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(sheet.getByText('Bob Builder')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Share proposal' })
    ).toHaveCount(0);
  });

  test('votes toggle opens the voter roster drawer', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    const roleCard = sheet.locator('.guild-proposal-card', {
      hasText: 'Bob Builder',
    });
    // Inline roster toggle rides on the progress label line.
    await expect(
      roleCard.getByText('3–1 · ready · Votes')
    ).toBeVisible();
    await roleCard.getByRole('button', { name: 'Votes', exact: true }).click();

    const voters = page.getByRole('dialog', {
      name: 'Make Bob Builder a Moderator',
    });
    await expect(voters).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(voters.getByText('Votes · #12')).toBeVisible();

    const aliceRow = voters.locator('.protocol-voter-row', {
      hasText: 'Alice Admin',
    });
    await expect(aliceRow.getByText('Support')).toBeVisible();
    const erinRow = voters.locator('.protocol-voter-row', {
      hasText: 'Erin Engineer',
    });
    await expect(erinRow.getByText('Oppose')).toBeVisible();

    // Members with no vote on record list as abstainers.
    await expect(voters.getByText("Hasn't voted").first()).toBeVisible();
  });

  test('sheet opened in-app owns a history entry — browser Back closes it', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(page, GUILD_E2E_PATH);

    await page.getByRole('button', { name: 'Guild menu' }).click();
    await page.getByRole('menuitem', { name: /Proposals/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page).toHaveURL(
      new RegExp(`${GUILD_E2E_PATH}\\?sheet=proposals`)
    );

    // Browser Back pops the sheet's entry — the drawer closes onto the
    // guild page instead of leaving the app.
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}$`));
  });

  test('cold proposal deep link closes onto the guild page', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphGuild(page, 'member');
    await stubGuildPage(page, { memberId: COLLECTIBLES_VAULT_OWNER });
    await stubGuildProposals(page);
    await gotoApp(page, `${GUILD_E2E_PATH}?sheet=proposals&proposal=12`);

    const sheet = page.getByRole('dialog', { name: 'Proposals' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    // No entry underneath a cold open — close replaces onto the bare guild
    // path rather than popping out of the app.
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${GUILD_E2E_PATH}$`));
  });
});

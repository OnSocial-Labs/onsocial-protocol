import { expect, test, type Locator } from '@playwright/test';
import {
  ENDORSE_E2E_ACCOUNT,
  openEndorseComposeLoggedOut,
  openEndorsementsPanelLoggedOut,
  stubEndorseComposeApis,
} from './helpers/endorse-compose-voice';

function borderTop(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).borderTopWidth);
}

test.describe('endorse compose voice', () => {
  test('Endorse sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubEndorseComposeApis(page);
    await openEndorseComposeLoggedOut(page);

    const sheet = page.getByRole('dialog', { name: /^Endorse / });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    const person = sheet.locator('.gesture-sheet-person');
    await expect(person).toBeVisible();
    await expect(person).not.toHaveText('alice.testnet');
    await expect(sheet.getByText('@alice.testnet')).toBeVisible();
    await expect(
      sheet.getByText('Connect to put your name behind them.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
    const attach = sheet.getByRole('button', { name: 'Attach photo or video' });
    await expect(attach).toBeVisible();
    await expect(attach).toHaveClass(/os-write-dock-tool/);
    await expect(attach).toHaveText('');

    const design = sheet.getByRole('button', { name: 'Design', exact: true });
    await expect(design).toHaveClass(/os-surface-chip/);
    await expect(design).not.toHaveClass(/endorse-compose-chip/);
    expect(await borderTop(design)).toBe('0px');
  });

  test('Received and Given use the standing list menu and search', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubEndorseComposeApis(page);
    await page.route('**/api/profile/endorsements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: ENDORSE_E2E_ACCOUNT,
          counts: { received: 1, given: 0 },
          received: [
            {
              issuer: 'bob.testnet',
              target: ENDORSE_E2E_ACCOUNT,
              topic: 'design',
              note: 'Clear product work.',
              v: 1,
              since: 1,
              blockHeight: 1,
              blockTimestamp: 1_700_000_000_000_000_000,
              issuerName: 'Bob',
              issuerAvatarUrl: null,
              targetName: null,
              targetAvatarUrl: null,
              mediaUrl: null,
              supporterCount: 0,
            },
          ],
          given: [],
          receivedHasMore: false,
          givenHasMore: false,
        }),
      });
    });
    const panel = await openEndorsementsPanelLoggedOut(page);

    const menu = panel.getByRole('button', { name: 'Open endorsements menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Received');
    await expect(panel.locator('.app-storage-mode-toggle')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Endorse', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Endorse', exact: true })
    ).toBeVisible();

    const search = panel.getByRole('textbox', { name: 'Search endorsements' });
    await expect(search).toBeVisible();
    await search.fill('nobody');
    await expect(panel.getByText('No matches.')).toBeVisible();
    await search.fill('bob');
    await expect(panel.getByText('Bob', { exact: true })).toBeVisible();
    await expect(panel.getByText('No matches.')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Support', exact: true })
    ).toBeVisible();

    await search.fill('');
    await menu.click();
    await expect(page.getByRole('option', { name: /Received/ })).toBeVisible();
    await page.getByRole('option', { name: /Given/ }).click();
    await expect(menu).toContainText('Given');
    await expect(panel.getByText('has not endorsed anyone yet.')).toBeVisible();
  });

  test('endorsement media opens the vouch, then the photo stage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const proof = `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="#c4a46a"/><text x="48" y="140" fill="#1c140c" font-size="54" font-family="sans-serif">Proof</text></svg>'
    )}`;
    await page.route('**/api/profile/endorsements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: ENDORSE_E2E_ACCOUNT,
          counts: { received: 1, given: 0 },
          received: [
            {
              issuer: 'bob.testnet',
              target: ENDORSE_E2E_ACCOUNT,
              topic: 'design',
              note: 'Clear product work.',
              v: 1,
              since: 1,
              blockHeight: 1,
              blockTimestamp: 1_700_000_000_000_000_000,
              issuerName: 'Bob',
              issuerAvatarUrl: null,
              targetName: 'Alice',
              targetAvatarUrl: null,
              media: {
                cid: 'bafyendorseproof',
                mime: 'image/svg+xml',
                alt: 'Workshop',
              },
              mediaUrl: proof,
              supporterCount: 0,
            },
          ],
          given: [],
          receivedHasMore: false,
          givenHasMore: false,
        }),
      });
    });

    const panel = await openEndorsementsPanelLoggedOut(page);
    const photo = panel.locator('.endorsement-row-media .post-media-element');
    await expect(photo).toBeVisible();
    const pictureOpensRow = await photo.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2
      );
      return Boolean(hit?.closest('.standing-row-hit'));
    });
    expect(pictureOpensRow).toBe(true);

    await panel
      .getByRole('button', { name: 'Open endorsement from Bob' })
      .click();
    const vouch = page.getByRole('dialog', { name: /design Bob/ });
    await expect(vouch).toBeVisible();
    await expect(vouch.getByText('Clear product work.')).toBeVisible();
    const share = vouch.getByRole('button', {
      name: 'Share endorsement',
      exact: true,
    });
    await expect(share).toBeVisible();
    await expect(share).toBeInViewport();
    await expect(share).toHaveText('');
    await expect(
      vouch.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
    await expect(
      vouch.getByRole('button', { name: 'Edit endorsement' })
    ).toHaveCount(0);

    await vouch.getByRole('button', { name: 'View endorsement photo' }).click();
    const stage = page.getByRole('dialog', {
      name: 'Bob endorsed Alice for design',
    });
    await expect(stage).toBeVisible();
    await expect(
      stage.getByRole('button', { name: 'Show endorsement' })
    ).toContainText('Bob endorsed Alice for design');
    await expect(stage.getByRole('button', { name: 'Reply' })).toHaveCount(0);
    await expect(stage.getByRole('button', { name: 'Repost' })).toHaveCount(0);
    await expect(stage.getByRole('button', { name: 'Quote' })).toHaveCount(0);

    await stage.getByRole('button', { name: 'Back to endorsement' }).click();
    await expect(stage).toBeHidden();
    await expect(vouch).toBeVisible();
  });
});

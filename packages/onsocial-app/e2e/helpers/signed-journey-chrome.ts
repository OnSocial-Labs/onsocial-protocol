import { expect, test, type Page } from '@playwright/test';
import {
  ENDORSE_CONNECTED_HINT,
  ENDORSE_CONNECT_HINT,
  ENDORSE_SUBMIT_CTA,
} from '../../src/lib/endorse-compose-voice';
import { seedE2eWallet } from './collection-page';
import { e2ePaintAccountId, e2ePortfolioAccountId } from './e2e-signers';
import {
  dismissNextDevOverlay,
  expectPortfolioIdentityOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './navigation';

/** Paint a visitor who is not the live portfolio face. */
export const SIGNED_CHROME_VIEWER = 'greenghost.onsocial.testnet';

export function signedChromeViewerAccount(): string {
  return e2ePaintAccountId(SIGNED_CHROME_VIEWER);
}

export function signedChromeTargetAccount(): string {
  return e2ePortfolioAccountId();
}

/** Intercept relationship + endorsements so gestures settle without a live indexer. */
export async function stubSignedJourneyApis(page: Page): Promise<void> {
  await page.route('**/api/profile/social/relationship**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        viewerStanding: false,
        theyStandWithViewer: false,
        viewerEndorsed: false,
        viewerEndorsementTopics: [],
      }),
    });
  });
  await page.route('**/api/profile/endorsements**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accountId: signedChromeTargetAccount(),
        counts: { received: 0, given: 0 },
        received: [],
        given: [],
        receivedHasMore: false,
        givenHasMore: false,
      }),
    });
  });
}

/**
 * Paint a connected visitor on the live portfolio face.
 * Does not sign. Stand / Endorse stay chrome-only — do not click submit.
 */
export async function openSignedVisitorProfile(page: Page): Promise<{
  viewer: string;
  target: string;
}> {
  const viewer = signedChromeViewerAccount();
  const target = signedChromeTargetAccount();
  if (viewer.toLowerCase() === target.toLowerCase()) {
    test.skip(
      true,
      'Paint viewer must differ from the portfolio target so Stand / Endorse show'
    );
  }
  await seedE2eWallet(page, viewer);
  await stubSignedJourneyApis(page);
  await gotoApp(page, `/@${target}`);
  await waitForPortfolioClientReady(page);
  await expectPortfolioIdentityOrSkip(page, target);
  await dismissNextDevOverlay(page);
  return { viewer, target };
}

export async function expectSignedVisitorGestures(page: Page): Promise<void> {
  const row = page.locator('.portfolio-identity-gesture-row').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('.portfolio-identity-gesture-row--loading')
  ).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Stand with / })).toBeVisible();
  await expect(row.getByText('Stand', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Endorse / })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Support / })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Message / })).toBeVisible();
  await expect(page.getByText('Connect wallet')).toHaveCount(0);
  await expect(
    page.locator('.portfolio-summon-account.is-connect')
  ).toHaveCount(0);
  await expect(page.locator('.portfolio-summon-account.is-you')).toBeVisible();
}

/** Face Endorse sheet for a painted visitor — submit chrome, no writes. */
export async function openSignedEndorseCompose(page: Page): Promise<void> {
  await openSignedVisitorProfile(page);
  await expectSignedVisitorGestures(page);
  await dismissNextDevOverlay(page);
  await page.locator('.portfolio-identity-gesture--endorse').click();
}

export async function expectSignedEndorseCompose(page: Page): Promise<void> {
  const sheet = page.getByRole('dialog', { name: /^Endorse / });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(
    sheet.getByText(ENDORSE_CONNECTED_HINT, { exact: true })
  ).toBeVisible();
  await expect(sheet.getByText(ENDORSE_CONNECT_HINT)).toHaveCount(0);
  await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: 'Connect', exact: true })
  ).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: ENDORSE_SUBMIT_CTA, exact: true })
  ).toBeVisible();
}

import { expect, test, type Page } from '@playwright/test';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  expectPortfolioIdentityOrSkip,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';

const GOVERNANCE = process.env.E2E_DAO_ACCOUNT ?? 'governance.onsocial.testnet';
const TREASURY =
  process.env.E2E_TREASURY_DAO_ACCOUNT ?? 'treasury.onsocial.testnet';

/** These faces can fit the phone. A spacer makes the scroll position real. */
async function parkFaceScroll(
  page: Page,
  pageId: string,
  top: number
): Promise<number> {
  return page
    .locator(`#${pageId} .portfolio-page`)
    .evaluate((node, nextTop) => {
      let spacer = node.querySelector<HTMLElement>('[data-e2e-spacer]');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.dataset.e2eSpacer = '1';
        spacer.style.height = '900px';
        spacer.style.flex = '0 0 auto';
        node.appendChild(spacer);
      }
      node.scrollTop = nextTop;
      return Math.round(node.scrollTop);
    }, top);
}

test.describe('protocol face pair', () => {
  test('click slides between Governance and Treasury on this page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await gotoApp(page, `/@${GOVERNANCE}`);
    await expectPortfolioIdentityOrSkip(page, GOVERNANCE);
    await waitForPortfolioClientReady(page);

    const pair = page.locator('.protocol-face-pair');
    await expect(pair).toBeVisible();
    await expect(
      page.locator('.protocol-face-pair-pill[data-placed="true"]')
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Governance', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('main')).toHaveAttribute(
      'data-page-account',
      GOVERNANCE
    );
    await expect(
      page.getByRole('navigation', { name: 'DAO tools' })
    ).toHaveCount(1);

    const historyBefore = await page.evaluate(() => history.length);
    await pair.evaluate((node) => {
      node.dataset.e2eStay = '1';
    });

    const governanceScroll = page.locator(
      '#protocol-face-governance .portfolio-page'
    );
    expect(
      await parkFaceScroll(page, 'protocol-face-governance', 200)
    ).toBeGreaterThan(40);

    await page.getByRole('tab', { name: 'Treasury', exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/@${TREASURY.replaceAll('.', '\\.')}/?$`)
    );
    await expect(pair).toHaveAttribute('data-e2e-stay', '1');
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await expect(
      page.getByRole('tab', { name: 'Treasury', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.locator('#protocol-face-treasury .portfolio-name')
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('main')).toHaveAttribute(
      'data-page-account',
      TREASURY
    );
    await expect(
      page.getByRole('navigation', { name: 'DAO tools' })
    ).toHaveCount(1);
    expect(
      await governanceScroll.evaluate((node) => Math.round(node.scrollTop))
    ).toBeGreaterThan(40);

    const treasuryScroll = page.locator(
      '#protocol-face-treasury .portfolio-page'
    );
    expect(
      await parkFaceScroll(page, 'protocol-face-treasury', 240)
    ).toBeGreaterThan(40);

    await page.getByRole('tab', { name: 'Governance', exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/@${GOVERNANCE.replaceAll('.', '\\.')}/?$`)
    );
    await expect
      .poll(() =>
        governanceScroll.evaluate((node) => Math.round(node.scrollTop))
      )
      .toBeGreaterThan(40);
    await expect
      .poll(() => treasuryScroll.evaluate((node) => Math.round(node.scrollTop)))
      .toBeGreaterThan(40);

    const pager = page.locator('.protocol-face-pager');
    const midThumb = await pager.evaluate(async (node) => {
      node.style.scrollSnapType = 'none';
      node.scrollLeft = node.clientWidth / 2;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      });
      const thumb = document.querySelector('.protocol-face-pair-thumb');
      const governance = document.getElementById(
        'protocol-face-tab-governance'
      );
      const treasury = document.getElementById('protocol-face-tab-treasury');
      const fill = thumb?.getBoundingClientRect();
      const from = governance?.getBoundingClientRect();
      const to = treasury?.getBoundingClientRect();
      return {
        progress: node.clientWidth > 0 ? node.scrollLeft / node.clientWidth : 0,
        thumb: fill?.left ?? null,
        thumbWidth: fill?.width ?? null,
        expectedLeft: from && to ? (from.left + to.left) / 2 : null,
        expectedWidth: from && to ? (from.width + to.width) / 2 : null,
      };
    });
    if (
      midThumb.thumb == null ||
      midThumb.thumbWidth == null ||
      midThumb.expectedLeft == null ||
      midThumb.expectedWidth == null
    ) {
      throw new Error('protocol face fill is not on screen');
    }
    expect(midThumb.progress).toBeCloseTo(0.5, 2);
    expect(Math.abs(midThumb.thumb - midThumb.expectedLeft)).toBeLessThan(6);
    expect(Math.abs(midThumb.thumbWidth - midThumb.expectedWidth)).toBeLessThan(
      6
    );

    await page.goBack();
    await expect(page).toHaveURL(/\/home\/?$/);
  });

  test('a shared Treasury link opens Treasury', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, `/@${TREASURY}`);
    await expectPortfolioIdentityOrSkip(page, TREASURY);
    await waitForPortfolioClientReady(page);

    await expect(page.locator('.protocol-face-pair')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Treasury', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('main')).toHaveAttribute(
      'data-page-account',
      TREASURY
    );
    await expect(page.locator('#protocol-face-governance')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  test('another account is not the pair', async ({ page }) => {
    const accountId = e2ePortfolioAccountId();
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, `/@${accountId}`);
    await expectPortfolioIdentityOrSkip(page, accountId);
    await waitForPortfolioClientReady(page);

    await expect(page.locator('.protocol-face-pair')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Governance' })).toHaveCount(0);
  });
});

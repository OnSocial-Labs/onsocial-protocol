import { expect, test } from '@playwright/test';
import {
  e2ePortfolioAccountId,
  expectPortfolioIdentityOrSkip,
  gotoApp,
} from './helpers';

const accountId = e2ePortfolioAccountId();
const portfolioPath = `/@${accountId}`;

test.describe('page drawer feed inset', () => {
  test('drawer column uses the page gutter and Home empty chrome', async ({
    page,
  }) => {
    await gotoApp(page, `${portfolioPath}?tab=posts`);
    await expectPortfolioIdentityOrSkip(page, accountId);

    const drawer = page.locator('.glass-sheet-panel.page-drawer-panel');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('.home-feed-state, .home-feed-list').first()
    ).toBeVisible({ timeout: 20_000 });

    const metrics = await page.evaluate(() => {
      const body = document.querySelector('.page-drawer-body');
      const header = document.querySelector('.page-drawer-header');
      if (!(body instanceof HTMLElement) || !(header instanceof HTMLElement)) {
        return null;
      }
      const bodyStyle = getComputedStyle(body);
      const headerStyle = getComputedStyle(header);
      const rootFont = parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      return {
        bodyPadX: bodyStyle.paddingLeft,
        headerPadX: headerStyle.paddingLeft,
        expectedPadX: `${rootFont * 0.75}px`,
        gutter: getComputedStyle(body).getPropertyValue('--os-gutter').trim(),
        hasPanelBody: Boolean(body.querySelector('.panel-body')),
        hasPlaceholder: Boolean(document.querySelector('.panel-placeholder')),
        hasScrollEnd: Boolean(
          document.querySelector('.page-drawer-scroll-end')
        ),
        hasHomeState: Boolean(document.querySelector('.home-feed-state')),
        hasFeedList: Boolean(document.querySelector('.home-feed-list')),
      };
    });

    expect(metrics).not.toBeNull();
    expect(['0.75rem', '.75rem']).toContain(metrics?.gutter);
    expect(metrics?.bodyPadX).toBe(metrics?.expectedPadX);
    expect(metrics?.headerPadX).toBe(metrics?.expectedPadX);
    expect(metrics?.hasPanelBody).toBe(false);
    expect(metrics?.hasPlaceholder).toBe(false);
    expect(metrics?.hasScrollEnd).toBe(true);
    expect(Boolean(metrics?.hasHomeState || metrics?.hasFeedList)).toBe(true);

    await page.locator('#profile-feed-tab-reposts').click();
    await expect(page.locator('#profile-feed-tab-reposts')).toHaveClass(
      /is-active/
    );
    await expect(page.locator('.panel-placeholder')).toHaveCount(0);
    await expect(page.locator('.page-drawer-scroll-end')).toHaveCount(1);
  });
});

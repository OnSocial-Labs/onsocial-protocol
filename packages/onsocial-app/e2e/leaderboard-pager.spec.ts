import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

function boardRows(scope: string) {
  return Array.from({ length: 24 }, (_, index) => {
    const rank = index + 1;
    const accountId =
      scope === 'influence'
        ? `boost-${rank}.testnet`
        : scope === 'earners'
          ? `earn-${rank}.testnet`
          : `rep-${rank}.testnet`;
    if (scope === 'influence') {
      return {
        accountId,
        rank,
        lockedAmount: '1',
        effectiveBoost: String(1_000_000_000_000_000_000_000 - index),
        lockMonths: 12,
      };
    }
    if (scope === 'earners') {
      return {
        accountId,
        rank,
        totalEarned: String(5_000_000_000_000_000_000_000 - index),
        unclaimed: '0',
      };
    }
    return {
      accountId,
      rank,
      reputation: String(90 - index),
      socialScore: '1',
      commitmentScore: '1',
      qualityScore: '1',
      consistencyScore: '1',
      scarcesScore: '1',
      confidenceScore: '1',
      totalPosts: 1,
      lockMonths: 1,
      boost: '0',
    };
  });
}

test.describe('leaderboard pager', () => {
  test('chips slide between boards and each list keeps its place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/leaderboard**', async (route) => {
      const url = new URL(route.request().url());
      const scope = url.searchParams.get('scope') ?? 'reputation';
      const key =
        scope === 'influence'
          ? 'leaderboardBoost'
          : scope === 'earners'
            ? 'leaderboardRewards'
            : 'reputationScores';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          [key]: boardRows(scope),
          viewerEntry: null,
        }),
      });
    });

    await gotoApp(page, '/leaderboard');
    await dismissNextDevOverlay(page);

    const pager = page.locator('.leaderboard-pager');
    await expect(pager).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reputation' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const reputation = page.locator('#leaderboard-panel-reputation');
    await expect(
      reputation.locator('a.standing-row-main[href="/@rep-1.testnet"]')
    ).toBeVisible();

    const reputationScroll = page.locator(
      '.leaderboard-pager-page[data-track="reputation"] .leaderboard-pager-scroll'
    );
    const placed = await reputationScroll.evaluate((node) => {
      node.scrollTop = 220;
      return Math.round(node.scrollTop);
    });
    expect(placed).toBeGreaterThan(40);

    await page.getByRole('tab', { name: 'Influence' }).click();
    await expect(page).toHaveURL(/track=influence/);
    await expect(page.getByRole('tab', { name: 'Influence' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect
      .poll(async () =>
        pager.evaluate((node) => Math.round(node.scrollLeft / node.clientWidth))
      )
      .toBe(1);
    await expect(
      page.locator(
        '#leaderboard-panel-influence a.standing-row-main[href="/@boost-1.testnet"]'
      )
    ).toBeVisible();
    await expect(page.locator('.leaderboard-track-rail')).not.toHaveClass(
      /is-scroll-hidden/
    );
    await page.screenshot({
      path: '/opt/cursor/artifacts/leaderboard-influence.png',
    });

    await pager.evaluate((node) => {
      node.scrollTo({ left: node.clientWidth * 2, behavior: 'auto' });
    });
    await expect(page.getByRole('tab', { name: 'Earners' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page).toHaveURL(/track=earners/);

    await page.getByRole('tab', { name: 'Reputation' }).click();
    await expect
      .poll(async () =>
        pager.evaluate((node) => Math.round(node.scrollLeft / node.clientWidth))
      )
      .toBe(0);
    await expect
      .poll(async () =>
        reputationScroll.evaluate((node) => Math.round(node.scrollTop))
      )
      .toBe(placed);
    await page.screenshot({
      path: '/opt/cursor/artifacts/leaderboard-reputation.png',
    });

    await page.getByRole('button', { name: 'Close leaderboard' }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
  });
});

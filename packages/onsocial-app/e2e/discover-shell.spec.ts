import { expect, test, type Page, type Route } from '@playwright/test';
import {
  clickTab,
  dismissNextDevOverlay,
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
  searchField,
  typeDiscoverPeopleSearch,
} from './helpers';

/**
 * Smoke for Discover shell — omni search + purpose-shaped tabs.
 * Does not assert live profile/topic rows.
 */
test.describe('discover shell', () => {
  test('loads search and Discover tabs', async ({ page }) => {
    await gotoApp(page, '/discover');

    await expectSearchVisible(
      page,
      'Search people, articles, books, music, and events'
    );

    await expectTabVisible(page, 'Discover', 'Moving');
    await expectTabVisible(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Discover', 'DAOs');
    await expectTabVisible(page, 'Discover', 'Guilds');
    await expectTabVisible(page, 'Discover', 'Hubs');
    await expectTabVisible(page, 'Discover', 'Topics');
    await expectTabVisible(page, 'Discover', 'Tickers');
    await expectTabSelected(page, 'Discover', 'Moving');
  });

  test('deep-links Profiles from ?tab=profiles', async ({ page }) => {
    await gotoApp(page, '/discover?tab=profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Filter profiles', 'All');
    await expectTabVisible(page, 'Filter profiles', 'People');
    await expectTabVisible(page, 'Filter profiles', 'Orgs');
    await expectTabVisible(page, 'Filter profiles', 'Offers');
    await expectTabVisible(page, 'Filter profiles', 'Hiring');
    await expect(page.getByText('Connect to stand with profiles.')).toHaveCount(
      0
    );
  });

  test('deep-links Topics from ?tab=topics', async ({ page }) => {
    await gotoApp(page, '/discover?tab=topics');
    await expectTabSelected(page, 'Discover', 'Topics');
  });

  test('Hubs is the hub directory', async ({ page }) => {
    await gotoApp(page, '/discover?tab=hubs');
    await expectTabSelected(page, 'Discover', 'Hubs');
    await expect(page.getByText('Creator hubs')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Most traded' })
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Most loved' })).toHaveCount(
      0
    );
    await expect(page.locator('#discover-panel-hubs')).toBeVisible();
  });

  test('browse lists hubs that moved, and search still finds a quiet hub', async ({
    page,
  }) => {
    await stubHubDirectory(page);
    await gotoApp(page, '/discover?tab=hubs');
    await expectTabSelected(page, 'Discover', 'Hubs');

    const list = page.locator('#discover-panel-hubs .apps-directory-list a');
    await expect(list).toHaveCount(2);
    await expect(list.nth(0)).toHaveAttribute('aria-label', 'New Market');
    await expect(list.nth(1)).toHaveAttribute('aria-label', 'Old Market');
    await expect(page.getByRole('link', { name: 'Quiet Market' })).toHaveCount(
      0
    );

    await dismissNextDevOverlay(page);
    const field = searchField(page, 'Search Hubs');
    await field.click();
    await field.fill('quiet');
    await expect(page.getByRole('link', { name: 'Quiet Market' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Market' })).toHaveCount(0);
  });

  test('keeps a plain search on Moving and shows grouped results', async ({
    page,
  }) => {
    await gotoApp(page, '/discover');
    await expectTabSelected(page, 'Discover', 'Moving');
    await typeDiscoverPeopleSearch(page, 'alice');
    await expect(page).not.toHaveURL(/tab=profiles/);
    await expectTabSelected(page, 'Discover', 'Moving');
    await expect(
      page.getByRole('region', { name: 'Search results' })
    ).toBeVisible();
  });

  test('keeps face chips off the Moving landing', async ({ page }) => {
    await gotoApp(page, '/discover');
    await expectTabSelected(page, 'Discover', 'Moving');
    await expect(
      page.getByRole('tablist', { name: 'Filter profiles' })
    ).toHaveCount(0);
    await clickTab(page, 'Discover', 'Profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Filter profiles', 'Offers');
    await expectTabVisible(page, 'Filter profiles', 'Hiring');
  });
});

function hubDirectoryRow(appId: string, name: string) {
  return {
    appId,
    ownerId: 'alice.near',
    primarySaleBps: 200,
    creatorAccess: 'open',
    metadata: JSON.stringify({ name, categories: ['music'] }),
    createdBlockTimestamp: 1_700_000_000_000_000_000,
    updatedBlockTimestamp: 1_700_000_000_000_000_000,
  };
}

const NEW_HUB = hubDirectoryRow('new-hub', 'New Market');
const OLD_HUB = hubDirectoryRow('old-hub', 'Old Market');
const QUIET_HUB = hubDirectoryRow('quiet-hub', 'Quiet Market');

/** Activity browse is stubbed; other graph reads stay on the live indexer. */
async function stubHubDirectory(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    let body: {
      query?: string;
      variables?: { queryLike?: string; ids?: string[] };
    } = {};
    try {
      body = JSON.parse(route.request().postData() ?? '{}') as typeof body;
    } catch {
      body = {};
    }
    const query = body.query ?? '';
    if (query.includes('ActiveHubStats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesAppStats: [
              { appId: 'old-hub', lastActivityTimestamp: 10 },
              { appId: 'new-hub', lastActivityTimestamp: 90 },
              { appId: 'idle-hub', lastActivityTimestamp: 0 },
            ],
          },
        }),
      });
      return;
    }
    if (query.includes('ActiveHubApps')) {
      const ids = body.variables?.ids ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesApps: [NEW_HUB, OLD_HUB].filter((row) =>
              ids.includes(row.appId)
            ),
          },
        }),
      });
      return;
    }
    if (query.includes('ScarcesAppsDirectory')) {
      const like = (body.variables?.queryLike ?? '').toLowerCase();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesApps: like.includes('quiet')
              ? [QUIET_HUB]
              : [NEW_HUB, OLD_HUB, QUIET_HUB],
          },
        }),
      });
      return;
    }
    await route.continue();
  });
}

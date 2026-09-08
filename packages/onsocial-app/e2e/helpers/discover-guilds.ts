import type { Page } from '@playwright/test';

export const DISCOVER_GUILDS_E2E_PATH = '/discover?tab=guilds';
export const DISCOVER_GUILDS_LOAD_MORE_ERROR = 'Could not load more guilds.';
export const DISCOVER_GUILDS_PAGE_SIZE = 24;
export const DISCOVER_GUILDS_FIRST_NAME = 'Catalog Guild 1';
export const DISCOVER_GUILDS_NEXT_NAME = 'Catalog Guild 25';

function browseRow(index: number) {
  return {
    groupId: `catalog-guild-${index}`,
    ownerId: 'alice.near',
    groupName: `Catalog Guild ${index}`,
    groupDescription: 'A stub guild for Discover browse.',
    groupBannerCid: null,
    groupBadgeCid: null,
    isPublic: true,
    isMemberDriven: false,
    groupTopics: ['builders'],
    memberCount: 3,
    blockHeight: 1000 - index,
    blockTimestamp: 1,
  };
}

function browsePage(offset: number, limit: number) {
  return Array.from({ length: limit }, (_, i) => browseRow(offset + i + 1));
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

/**
 * First BrowseGroups page paints a full catalog page.
 * The next page fails once so load-more Retry can recover.
 */
export async function stubDiscoverGuildsBrowse(
  page: Page,
  opts?: { failMoreOnce?: boolean }
): Promise<void> {
  let moreFailed = false;
  const failMoreOnce = opts?.failMoreOnce ?? true;

  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    let offset = 0;
    let limit = DISCOVER_GUILDS_PAGE_SIZE;
    try {
      const body = JSON.parse(raw) as {
        query?: string;
        variables?: { offset?: number; limit?: number };
      };
      query = String(body.query ?? '');
      offset = Number(body.variables?.offset ?? 0);
      limit = Number(body.variables?.limit ?? DISCOVER_GUILDS_PAGE_SIZE);
    } catch {
      query = raw;
    }

    if (query.includes('BrowseGroups')) {
      if (offset > 0 && failMoreOnce && !moreFailed) {
        moreFailed = true;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: DISCOVER_GUILDS_LOAD_MORE_ERROR }),
        });
        return;
      }
      await route.fulfill(
        json({
          data: {
            groupsByMemberCount: browsePage(offset, limit),
          },
        })
      );
      return;
    }

    await route.continue();
  });
}

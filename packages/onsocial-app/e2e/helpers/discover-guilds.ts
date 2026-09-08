import type { Page } from '@playwright/test';

export const DISCOVER_GUILDS_E2E_PATH = '/discover?tab=guilds';
export const DISCOVER_GUILDS_LOAD_MORE_ERROR = 'Could not load more guilds.';
export const DISCOVER_GUILDS_SEARCH_ERROR = 'Could not search guilds.';
export const DISCOVER_GUILDS_PAGE_SIZE = 24;
export const DISCOVER_GUILDS_FIRST_NAME = 'Catalog Guild 1';
export const DISCOVER_GUILDS_NEXT_NAME = 'Catalog Guild 25';
export const DISCOVER_GUILDS_SEARCH_QUERY = 'rebels';
export const DISCOVER_GUILDS_SEARCH_HIT = 'Rebels Guild';

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
 * Search (`queryLike`) can fail once so search Retry can recover.
 */
export async function stubDiscoverGuildsBrowse(
  page: Page,
  opts?: { failMoreOnce?: boolean; failSearchOnce?: boolean }
): Promise<void> {
  let moreFailed = false;
  let searchFailed = false;
  const failMoreOnce = opts?.failMoreOnce ?? true;
  const failSearchOnce = opts?.failSearchOnce ?? false;

  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    let offset = 0;
    let limit = DISCOVER_GUILDS_PAGE_SIZE;
    let queryLike: string | undefined;
    try {
      const body = JSON.parse(raw) as {
        query?: string;
        variables?: { offset?: number; limit?: number; queryLike?: string };
      };
      query = String(body.query ?? '');
      offset = Number(body.variables?.offset ?? 0);
      limit = Number(body.variables?.limit ?? DISCOVER_GUILDS_PAGE_SIZE);
      queryLike = body.variables?.queryLike;
    } catch {
      query = raw;
    }

    if (query.includes('BrowseGroups')) {
      const isSearch = Boolean(queryLike);
      if (isSearch && failSearchOnce && !searchFailed) {
        searchFailed = true;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: DISCOVER_GUILDS_SEARCH_ERROR }),
        });
        return;
      }
      if (isSearch) {
        await route.fulfill(
          json({
            data: {
              groupsByMemberCount: [
                {
                  ...browseRow(99),
                  groupId: 'rebels-guild',
                  groupName: DISCOVER_GUILDS_SEARCH_HIT,
                },
              ],
            },
          })
        );
        return;
      }
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

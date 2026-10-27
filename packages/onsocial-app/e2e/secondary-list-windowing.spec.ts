import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  dismissNextDevOverlay,
  gotoApp,
  typeDiscoverPeopleSearch,
} from './helpers';
import { setE2eGraphArticles } from './helpers/e2e-graph';

// Mirrors LEADERBOARD_PAGE_SIZE (@onsocial/sdk) and the discover guilds
// BROWSE_LIMIT / POST_QUOTES_PAGE_SIZE / POST_REPOSTERS_PAGE_SIZE app
// constants. Row counts must clear the window's 1600px overscan or far rows
// never collapse (short 76px rows need well more than the 30-row floor).
const LEADERBOARD_PAGE_SIZE = 20;
const GUILD_BROWSE_PAGE_SIZE = 24;
const POST_QUOTES_PAGE_SIZE = 12;
const POST_REPOSTERS_PAGE_SIZE = 50;

const LEADERBOARD_ROW_COUNT = 64;
const GUILD_ROW_COUNT = 48;
const QUOTE_COUNT = 44;
const REPOST_COUNT = 64;

function leaderboardReputationRow(index: number) {
  return {
    accountId: `rep-${String(index + 1).padStart(2, '0')}.testnet`,
    rank: index + 1,
    reputation: String(5000 - index),
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
}

/** Reputation pages of 20 to 64 rows; empty boards for the other tracks. */
async function stubLeaderboardBoards(page: Page): Promise<number[]> {
  const servedOffsets: number[] = [];
  const rows = Array.from({ length: LEADERBOARD_ROW_COUNT }, (_, index) =>
    leaderboardReputationRow(index)
  );
  await page.route('**/api/leaderboard**', async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get('scope') ?? 'reputation';
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const limit = Number(
      url.searchParams.get('limit') ?? LEADERBOARD_PAGE_SIZE
    );
    servedOffsets.push(offset);
    const body =
      scope === 'reputation'
        ? {
            reputationScores: rows.slice(offset, offset + limit),
            viewerEntry: null,
          }
        : scope === 'influence'
          ? { leaderboardBoost: [], viewerEntry: null }
          : { leaderboardRewards: [], viewerEntry: null };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return servedOffsets;
}

function guildBrowseRow(index: number) {
  return {
    groupId: `window-guild-${String(index + 1).padStart(2, '0')}`,
    ownerId: 'alice.near',
    groupName: `Window Guild ${index + 1}`,
    groupDescription: 'A stub guild for Discover windowing.',
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

/** Finite 48-row catalog: two full pages, then an empty page ends paging. */
async function stubGuildBrowseWindow(page: Page): Promise<number[]> {
  const servedOffsets: number[] = [];
  const rows = Array.from({ length: GUILD_ROW_COUNT }, (_, index) =>
    guildBrowseRow(index)
  );
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    let offset = 0;
    try {
      const body = JSON.parse(raw) as {
        query?: string;
        variables?: { offset?: number };
      };
      query = String(body.query ?? '');
      offset = Number(body.variables?.offset ?? 0);
    } catch {
      query = raw;
    }
    if (!query.includes('BrowseGroups')) {
      await route.continue();
      return;
    }
    servedOffsets.push(offset);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          groupsByMemberCount: rows.slice(
            offset,
            offset + GUILD_BROWSE_PAGE_SIZE
          ),
        },
      }),
    });
  });
  return servedOffsets;
}

const quoteRow = (index: number) => ({
  quoteAuthor: `quoter-${String(index + 1).padStart(2, '0')}.testnet`,
  quoteId: `quote-${index + 1}`,
  value: JSON.stringify({ v: 1, text: `Quoted take ${index + 1}` }),
  blockHeight: 1_000_000 - index,
  blockTimestamp: 1_700_000_000_000 - index * 1_000,
  groupId: null,
  refAuthor: 'alice.testnet',
  refPath: 'alice.testnet/post/root-post',
  refType: 'Post',
});

const repostRow = (index: number) => ({
  repostAuthor: `reposter-${String(index + 1).padStart(2, '0')}.testnet`,
  repostId: `repost-${index + 1}`,
  groupId: null,
  blockTimestamp: 1_700_000_000_000 - index * 1_000,
});

/**
 * The quotes screen SSR-misses on testnet and hydrates from these stubs.
 * Quotes page by offset (12/page → three load-more clicks); reposters
 * arrive in one page under the 50-row limit.
 */
async function stubQuotesPage(
  page: Page
): Promise<{ quoteOffsets: number[]; reposterOffsets: number[] }> {
  const quoteOffsets: number[] = [];
  const reposterOffsets: number[] = [];
  const quotes = Array.from({ length: QUOTE_COUNT }, (_, index) =>
    quoteRow(index)
  );
  const reposts = Array.from({ length: REPOST_COUNT }, (_, index) =>
    repostRow(index)
  );
  await page.route('**/api/onapi/graph/query', async (route) => {
    const payload = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { offset?: number };
    };
    const query = String(payload.query);
    const json = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      });
    if (query.includes('QuotesByPath')) {
      const offset = Number(payload.variables?.offset ?? 0);
      quoteOffsets.push(offset);
      return json({
        quotes: quotes.slice(offset, offset + POST_QUOTES_PAGE_SIZE),
      });
    }
    if (query.includes('RepostersByPath')) {
      const offset = Number(payload.variables?.offset ?? 0);
      reposterOffsets.push(offset);
      return json({
        reposts: reposts.slice(offset, offset + POST_REPOSTERS_PAGE_SIZE),
      });
    }
    if (query.includes('postsCurrent')) {
      return json({
        postsCurrent: [
          {
            accountId: 'alice.testnet',
            postId: 'root-post',
            value: JSON.stringify({
              v: 1,
              text: 'Root post for quotes windowing.',
            }),
            blockHeight: 1_000_000,
            blockTimestamp: 1_700_000_000_000,
            parentPath: '',
            groupId: null,
          },
        ],
      });
    }
    return route.continue();
  });
  return { quoteOffsets, reposterOffsets };
}

/**
 * Jump a scroller to an edge. Windowed lists re-measure as spacers settle, so
 * callers scroll once, wait on a Playwright retry assertion, then scroll
 * again — the same pattern as thread-windowing.spec.ts.
 */
function scrollScrollerTo(locator: Locator, position: 'top' | 'bottom') {
  return locator.evaluate((node, at) => {
    node.scrollTop = at === 'bottom' ? node.scrollHeight : 0;
  }, position);
}

test.describe('secondary list windowing', () => {
  test('leaderboard board windows past the first page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const servedOffsets = await stubLeaderboardBoards(page);
    await gotoApp(page, '/leaderboard');
    await dismissNextDevOverlay(page);

    const list = page.locator(
      '.leaderboard-pager-page[data-track="reputation"] .leaderboard-list[role="list"]'
    );
    const scroller = page.locator(
      '.leaderboard-pager-page[data-track="reputation"] .leaderboard-pager-scroll'
    );
    const rowLink = (accountId: string) =>
      list.locator(`a.standing-row-main[href="/@${accountId}"]`);
    const rows = list.locator('[role="listitem"]');

    await expect(rowLink('rep-01.testnet')).toBeVisible({ timeout: 30_000 });
    // First page is under the 30-row floor — everything renders.
    await expect(rows).toHaveCount(LEADERBOARD_PAGE_SIZE);
    await expect(list.locator('[data-feed-window-spacer]')).toHaveCount(0);

    // Walk the sentinel through the remaining three pages (20 + 20 + 20 + 4).
    const lastOffset =
      Math.floor((LEADERBOARD_ROW_COUNT - 1) / LEADERBOARD_PAGE_SIZE) *
      LEADERBOARD_PAGE_SIZE;
    for (
      let attempt = 0;
      attempt < 10 && !servedOffsets.includes(lastOffset);
      attempt += 1
    ) {
      await scrollScrollerTo(scroller, 'bottom');
      await page.waitForTimeout(500);
    }
    expect(servedOffsets).toContain(lastOffset);
    await expect(page.getByText('Showing top 64')).toBeVisible({
      timeout: 15_000,
    });

    await scrollScrollerTo(scroller, 'bottom');
    await expect(rowLink('rep-64.testnet')).toBeVisible({ timeout: 10_000 });
    await scrollScrollerTo(scroller, 'bottom');
    await expect.poll(() => rows.count()).toBeLessThan(LEADERBOARD_ROW_COUNT);
    await expect(rowLink('rep-01.testnet')).toHaveCount(0);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );

    await scrollScrollerTo(scroller, 'top');
    await expect(rowLink('rep-01.testnet')).toBeVisible({ timeout: 10_000 });
    await expect(rowLink('rep-64.testnet')).toHaveCount(0);
  });

  test('discover guilds windows the browse grid', async ({ page }) => {
    const servedOffsets = await stubGuildBrowseWindow(page);
    await gotoApp(page, '/discover?tab=guilds');
    await dismissNextDevOverlay(page);

    const grid = page.locator('.community-summary-card-grid');
    const scroller = page.locator('.os-app-screen-body').first();
    const guildLink = (name: string) =>
      grid.getByRole('link', { name, exact: true });
    const rows = grid.locator('[data-secondary-key]');

    await expect(guildLink('Window Guild 1')).toBeVisible({ timeout: 30_000 });
    await expect(rows).toHaveCount(GUILD_BROWSE_PAGE_SIZE);
    await expect(grid.locator('[data-feed-window-spacer]')).toHaveCount(0);

    // Walk the sentinel: page two fills the grid, the empty third page ends it.
    for (
      let attempt = 0;
      attempt < 10 && !servedOffsets.includes(GUILD_ROW_COUNT);
      attempt += 1
    ) {
      await scroller.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(500);
    }
    expect(servedOffsets).toContain(GUILD_ROW_COUNT);

    await scrollScrollerTo(scroller, 'bottom');
    await expect(guildLink(`Window Guild ${GUILD_ROW_COUNT}`)).toBeVisible({
      timeout: 10_000,
    });
    await scrollScrollerTo(scroller, 'bottom');
    await expect.poll(() => rows.count()).toBeLessThan(GUILD_ROW_COUNT);
    await expect(guildLink('Window Guild 1')).toHaveCount(0);
    await expect(grid.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );

    await scrollScrollerTo(scroller, 'top');
    await expect(guildLink('Window Guild 1')).toBeVisible({ timeout: 10_000 });
  });

  test('discover articles window the More articles sheet', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphArticles(page, 'window');
    await gotoApp(page, '/discover');
    await typeDiscoverPeopleSearch(page, 'window');

    const results = page.getByRole('region', { name: 'Search results' });
    await expect(
      results.getByRole('link', { name: 'Window article 1', exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'More articles' }).click();

    const dialog = page.getByRole('dialog', { name: 'Articles' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const list = dialog.locator('[role="list"]');
    const scroller = dialog.locator('.os-app-screen-body');
    const rows = list.locator('[data-secondary-key]');
    const articleLink = (title: string) =>
      list.getByRole('link', { name: title, exact: true });

    // First page (24) is under the floor; paging fills 44 and the window caps.
    await expect(articleLink('Window article 1')).toBeVisible({
      timeout: 15_000,
    });
    await expect(rows).toHaveCount(24);
    await scrollScrollerTo(scroller, 'bottom');
    // Page two lands while parked mid-list — then catch up to the new bottom.
    await expect
      .poll(() => rows.count(), { timeout: 10_000 })
      .toBeGreaterThan(24);
    await scrollScrollerTo(scroller, 'bottom');
    await expect(articleLink('Window article 44')).toBeVisible({
      timeout: 10_000,
    });
    await scrollScrollerTo(scroller, 'bottom');

    await expect.poll(() => rows.count()).toBeLessThan(44);
    await expect(articleLink('Window article 1')).toHaveCount(0);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );

    await scrollScrollerTo(scroller, 'top');
    await expect(articleLink('Window article 1')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('post quotes panel windows quotes and reposters', async ({ page }) => {
    test.setTimeout(120_000);
    const { quoteOffsets, reposterOffsets } = await stubQuotesPage(page);
    await gotoApp(page, '/@alice.testnet/posts/root-post/quotes');
    await dismissNextDevOverlay(page);

    const quotesPanel = page.getByRole('tabpanel', { name: /Quotes/ });
    const quotesScroller = page.locator(
      '#post-quotes-page-quotes .post-quotes-page-scroll'
    );
    const quotesHost = quotesScroller.locator('> div').first();
    const quoteRows = quotesHost.locator('[data-secondary-key]');

    await expect(
      quotesPanel.getByText('Quoted take 1', { exact: true })
    ).toBeVisible({
      timeout: 30_000,
    });
    // First page (12) renders fully; three load-more clicks bring in the rest.
    await expect(quoteRows).toHaveCount(POST_QUOTES_PAGE_SIZE);
    const showMore = quotesPanel.getByRole('button', {
      name: 'Show more quotes',
    });
    const lastQuoteOffset =
      Math.floor((QUOTE_COUNT - 1) / POST_QUOTES_PAGE_SIZE) *
      POST_QUOTES_PAGE_SIZE;
    for (
      let attempt = 0;
      attempt < 8 && !quoteOffsets.includes(lastQuoteOffset);
      attempt += 1
    ) {
      if ((await showMore.count()) > 0) await showMore.click();
      await page.waitForTimeout(400);
    }
    expect(quoteOffsets).toContain(lastQuoteOffset);
    await expect(showMore).toHaveCount(0);
    await expect.poll(() => quoteRows.count()).toBeLessThan(QUOTE_COUNT);

    await scrollScrollerTo(quotesScroller, 'bottom');
    await expect(
      quotesPanel.getByText(`Quoted take ${QUOTE_COUNT}`, { exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await scrollScrollerTo(quotesScroller, 'bottom');
    await expect(
      quotesHost.locator('[data-secondary-key="quoter-01.testnet:quote-1"]')
    ).toHaveCount(0);
    await expect(
      quotesHost.locator('[data-feed-window-spacer="top"]')
    ).toHaveCount(1);

    // Reposters arrive in a 50-row page; one more click crosses the overscan.
    await page.getByRole('tab', { name: /Reposts/ }).click();
    const repostersPanel = page.getByRole('tabpanel', { name: /Reposts/ });
    const repostersScroller = page.locator(
      '#post-quotes-page-reposts .post-quotes-page-scroll'
    );
    const repostersHost = repostersScroller.locator('> div').first();
    const reposterRows = repostersHost.locator('[data-secondary-key]');
    const reposterWrapper = (index: number) =>
      repostersHost.locator(
        `[data-secondary-key="reposter-${String(index).padStart(2, '0')}.testnet:repost-${index}"]`
      );

    await expect(reposterWrapper(1)).toBeVisible({ timeout: 15_000 });
    const showMoreReposts = repostersPanel.getByRole('button', {
      name: 'Show more reposts',
    });
    for (
      let attempt = 0;
      attempt < 6 && !reposterOffsets.includes(POST_REPOSTERS_PAGE_SIZE);
      attempt += 1
    ) {
      if ((await showMoreReposts.count()) > 0) await showMoreReposts.click();
      await page.waitForTimeout(400);
    }
    expect(reposterOffsets).toContain(POST_REPOSTERS_PAGE_SIZE);
    await expect(showMoreReposts).toHaveCount(0);

    await scrollScrollerTo(repostersScroller, 'top');
    await expect
      .poll(() => reposterRows.count(), { timeout: 10_000 })
      .toBeLessThan(REPOST_COUNT);

    await scrollScrollerTo(repostersScroller, 'bottom');
    await expect(reposterWrapper(REPOST_COUNT)).toBeVisible({
      timeout: 10_000,
    });
    await scrollScrollerTo(repostersScroller, 'bottom');
    await expect(reposterWrapper(1)).toHaveCount(0);
    await expect(
      repostersHost.locator('[data-feed-window-spacer="top"]')
    ).toHaveCount(1);

    await scrollScrollerTo(repostersScroller, 'top');
    await expect(reposterWrapper(1)).toBeVisible({ timeout: 10_000 });
  });
});

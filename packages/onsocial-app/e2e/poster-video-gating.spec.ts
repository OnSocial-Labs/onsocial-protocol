import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphProfile } from './helpers/e2e-graph';
import { E2E_PROFILE_ACCOUNT } from '../src/lib/e2e-graph-stubs';

/**
 * Poster-video near/far gating (adoption audit g6). Quote thumbs and the
 * profile Media grid mounted preload="metadata" videos eagerly — an
 * unbounded grid held a fetch per cover ever loaded. The 'poster' mode of
 * usePostVideoPlayback now mounts videos only within three viewport
 * heights and preloads metadata within two, with no autoplay.
 *
 * The profile Media grid is the unwindowed surface, so it is the proof:
 * 40 stubbed video covers — far covers must not mount a <video>, the head
 * must collapse after a deep scroll, and the tail must rematerialize.
 */

const MEDIA_HOST = 'https://media.example';

function videoPostRow(index: number) {
  return {
    accountId: E2E_PROFILE_ACCOUNT,
    postId: `clip-${index}`,
    value: JSON.stringify({
      v: 1,
      text: `Clip ${index}`,
      media: [{ cid: `${MEDIA_HOST}/clip-${index}.mp4`, mime: 'video/mp4' }],
    }),
    blockHeight: 1000 - index,
    blockTimestamp: 1_700_000_000_000 - index * 60_000,
    receiptId: `receipt-clip-${index}`,
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: 'Banner',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

async function stubVideoAuthorFeed(page: Page): Promise<void> {
  const rows = Array.from({ length: 40 }, (_, index) => videoPostRow(index));
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    let variables: { author?: string } = {};
    try {
      const parsed = JSON.parse(raw) as {
        query?: string;
        variables?: { author?: string };
      };
      query = String(parsed.query ?? '');
      variables = parsed.variables ?? {};
    } catch {
      query = raw;
    }

    if (query.includes('postsFeed') && variables.author === E2E_PROFILE_ACCOUNT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { postsFeed: rows } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
  // Poster fetches fail fast instead of hanging on DNS.
  await page.route(`${MEDIA_HOST}/*`, async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });
}

test.describe('poster video gating (media grid)', () => {
  test('far covers unmount, tail materializes on scroll, head collapses', async ({
    page,
  }) => {
    await setE2eGraphProfile(page, 'banner');
    await stubVideoAuthorFeed(page);
    await gotoApp(page, `/@${E2E_PROFILE_ACCOUNT}?tab=posts`);
    await dismissNextDevOverlay(page);

    // Posts top-up fills the pool client-side, then the Media tab filters
    // it into cover cards.
    await expect(page.locator('.home-feed-block').first()).toBeVisible({
      timeout: 20_000,
    });
    await page.locator('#profile-feed-tab-media').click();

    const covers = page.locator('.page-drawer-media-card');
    await expect(covers).toHaveCount(40, { timeout: 15_000 });

    const videos = page.locator('.page-drawer-media-cover video');
    await expect(videos.first()).toBeVisible({ timeout: 15_000 });
    const initialMounted = await videos.count();
    expect(initialMounted).toBeGreaterThan(0);
    // Far covers (beyond three viewport heights) never mount the element.
    expect(initialMounted).toBeLessThan(40);
    // Near covers fetch metadata for the first frame.
    await expect(videos.first()).toHaveAttribute('preload', 'metadata');

    // Every card keeps its cover box and badge regardless of mount state.
    await expect(
      page.locator('.page-drawer-media-cover.has-media')
    ).toHaveCount(40);
    await expect(page.locator('.page-drawer-media-badge')).toHaveCount(40);

    // Deep scroll: the tail rematerializes, the head collapses.
    await covers.nth(39).scrollIntoViewIfNeeded();
    await expect(covers.nth(39).locator('video')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(covers.first().locator('video')).toHaveCount(0, {
      timeout: 15_000,
    });
    const deepMounted = await videos.count();
    expect(deepMounted).toBeGreaterThan(0);
    expect(deepMounted).toBeLessThan(40);

    // Scroll back: the head remounts, the tail collapses.
    await covers.first().scrollIntoViewIfNeeded();
    await expect(covers.first().locator('video')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(covers.nth(39).locator('video')).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});

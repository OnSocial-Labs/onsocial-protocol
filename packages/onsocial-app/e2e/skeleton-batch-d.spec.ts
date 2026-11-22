import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import {
  setE2eGraphDrop,
  setE2eGraphDrops,
  setE2eGraphMarket,
  setE2eGraphProfile,
} from './helpers/e2e-graph';
import { E2E_PROFILE_ACCOUNT } from '../src/lib/e2e-graph-stubs';

const ARTIFACTS = '/opt/cursor/artifacts';
const SHOT_LOG = `${ARTIFACTS}/skeleton-d-shots.jsonl`;
const MEDIA_HOST = 'https://media.example';
const VIEWER = 'ada.near';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

function discoverProfiles() {
  return ['Bob', 'Cara', 'Dee'].map((name, index) => ({
    accountId: `${name.toLowerCase()}.near`,
    name,
    bio: `${name} writes in public.`,
    avatarUrl: null,
    kind: 'person',
    standingCount: 4,
    standingWithCount: 2,
    mutualStandingCount: 1,
    endorsementsReceivedCount: 1,
    endorsementsGivenCount: 0,
    moodId: 'protocol',
    viewerStanding: true,
    theyStandWithViewer: true,
    targetEndorsedViewer: index === 0,
    viewerEndorsed: true,
    offerCount: 0,
  }));
}

function mediaPost(index: number) {
  return {
    accountId: E2E_PROFILE_ACCOUNT,
    postId: `photo-${index}`,
    value: JSON.stringify({
      v: 1,
      text: `Photo ${index}`,
      media: [`${MEDIA_HOST}/photo-${index}.png`],
    }),
    blockHeight: 800 - index,
    blockTimestamp: 1_700_000_000_000 - index * 60_000,
    receiptId: `receipt-photo-${index}`,
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

async function stubPopulatedSurfaces(page: Page): Promise<void> {
  await page.route('**/api/discover**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: url.searchParams.get('q') ?? '',
        face: url.searchParams.get('face') ?? 'all',
        industry: url.searchParams.get('industry') ?? '',
        craft: url.searchParams.get('craft') ?? '',
        limit: 24,
        offset: Number(url.searchParams.get('offset') ?? 0),
        hasMore: false,
        profiles: discoverProfiles(),
      }),
    });
  });

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
    if (
      query.includes('postsFeed') &&
      variables.author === E2E_PROFILE_ACCOUNT
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            postsFeed: [0, 1, 2, 3].map((index) => mediaPost(index)),
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`${MEDIA_HOST}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG,
    });
  });
}

type SignalMeasure = {
  viewport: number;
  wrapperHeight: number;
  signalsHeight: number;
  rowHeight: number;
  unwrappedRowHeight: number;
};

async function measureSignalRow(
  page: Page,
  viewport: number
): Promise<SignalMeasure> {
  const measured = await page.evaluate(() => {
    const row = document.querySelector(
      '#discover-panel-profiles .standing-row'
    );
    const appear = row?.querySelector(':scope .os-page-body-appear');
    const signals =
      appear instanceof HTMLElement &&
      appear.classList.contains('standing-row-signals')
        ? appear
        : appear?.querySelector('.standing-row-signals');
    if (
      !(row instanceof HTMLElement) ||
      !(appear instanceof HTMLElement) ||
      !(signals instanceof HTMLElement)
    ) {
      return null;
    }
    const rowHeight = row.getBoundingClientRect().height;
    const wrapperHeight = appear.getBoundingClientRect().height;
    const signalsHeight = signals.getBoundingClientRect().height;
    const host = document.createElement('div');
    const width = row.getBoundingClientRect().width;
    host.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;`;
    const clone = row.cloneNode(true);
    host.appendChild(clone);
    document.body.appendChild(host);
    const wrap = (clone as HTMLElement).querySelector(
      ':scope .os-page-body-appear'
    );
    const inner = wrap?.querySelector('.standing-row-signals');
    if (wrap && inner) wrap.replaceWith(inner);
    const unwrappedRowHeight = (clone as HTMLElement).getBoundingClientRect()
      .height;
    host.remove();
    return { wrapperHeight, signalsHeight, rowHeight, unwrappedRowHeight };
  });
  expect(measured).toBeTruthy();
  return { viewport, ...measured! };
}

async function holdJsChunks(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  await page.route('**/_next/static/**/*.js', async (route) => {
    held.push(route);
  });
  return async () => {
    await page.unroute('**/_next/static/**/*.js').catch(() => {});
    await Promise.all(
      held.splice(0).map((route) => route.continue().catch(() => {}))
    );
  };
}

test.describe('skeleton batch D', () => {
  test('drops cold skeleton omits the market footer before hydration', async ({
    page,
  }) => {
    const release = await holdJsChunks(page);
    await page.goto('/drops', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.market-listing-list--skeleton')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Looking for secondary listings?')).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(
      0
    );
    expect(
      await page.evaluate(() => document.body.dataset.appHydrated ?? '')
    ).not.toBe('true');
    await release();
  });

  for (const width of [390, 1280] as const) {
    test(`after shots at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await seedE2eWallet(page, VIEWER);
      await stubPopulatedSurfaces(page);
      const sha = execSync('git rev-parse HEAD', {
        cwd: '/agent/repos/onsocial-protocol',
      })
        .toString()
        .trim();
      const shot = async (name: string) => {
        const path = `${ARTIFACTS}/skeleton-d-${name}-${width}.png`;
        await page.screenshot({ path });
        appendFileSync(
          SHOT_LOG,
          `${JSON.stringify({
            sha,
            name,
            path,
            url: page.url(),
            viewport: { width, height: width === 390 ? 844 : 800 },
            time: new Date().toISOString(),
          })}\n`
        );
      };

      await setE2eGraphDrop(page, 'default');
      await gotoApp(page, '/collection/night-drive');
      await expect(page.locator('.collection-title')).toHaveText(
        'Night Drive',
        {
          timeout: 20_000,
        }
      );
      await expect(page.locator('.collection-tracks')).toBeVisible();
      await shot('collection-audio');

      await gotoApp(page, '/collection/quiet-print');
      await expect(page.locator('.collection-title')).toHaveText(
        'Quiet Print',
        {
          timeout: 20_000,
        }
      );
      await expect(page.locator('.collection-cover.is-square')).toBeVisible();
      await expect(page.locator('.collection-cover.is-immersive')).toHaveCount(
        0
      );
      await shot('collection-art');

      await setE2eGraphDrops(page, 'covers');
      await gotoApp(page, '/drops');
      await expect(page.locator('.drops-discovery-row').first()).toBeVisible({
        timeout: 20_000,
      });
      await shot('drops');

      await setE2eGraphDrops(page, 'events');
      await gotoApp(page, '/events');
      await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible(
        {
          timeout: 20_000,
        }
      );
      await shot('events');

      await setE2eGraphMarket(page, 'live-first');
      await gotoApp(page, '/market');
      await expect(page.locator('.market-listing-row').first()).toBeVisible({
        timeout: 20_000,
      });
      await shot('market');

      await setE2eGraphProfile(page, 'banner');
      await gotoApp(page, `/@${E2E_PROFILE_ACCOUNT}?tab=replies`);
      const replies = page.locator('#profile-feed-tab-replies');
      await expect(replies).toBeVisible({ timeout: 20_000 });
      await replies.click();
      await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0, {
        timeout: 20_000,
      });
      await shot('drawer-replies');
      await page.locator('#profile-feed-tab-reposts').click();
      await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0, {
        timeout: 20_000,
      });
      await shot('drawer-reposts');
      await page.locator('#profile-feed-tab-media').click();
      await expect(page.locator('.page-drawer-media-card').first()).toBeVisible(
        {
          timeout: 20_000,
        }
      );
      await shot('drawer-media');

      await gotoApp(page, '/discover?tab=profiles');
      await expect(page.getByRole('tab', { name: 'Profiles' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByText('Solidarity', { exact: true }).first()
      ).toBeVisible({
        timeout: 20_000,
      });
      const measure = await measureSignalRow(page, width);
      appendFileSync(
        `${ARTIFACTS}/skeleton-d-row10.jsonl`,
        `${JSON.stringify({ sha, ...measure, time: new Date().toISOString() })}\n`
      );
      expect(
        Math.abs(measure.rowHeight - measure.unwrappedRowHeight)
      ).toBeLessThan(0.6);
      await shot('discover');
    });
  }
});

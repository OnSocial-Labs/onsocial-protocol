import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphProfile } from './helpers/e2e-graph';
import { GUILD_E2E_PATH, stubGuildPage } from './helpers/guild-page';
import {
  E2E_PROFILE_ACCOUNT,
  E2E_PROFILE_BANNER_CID,
} from '../src/lib/e2e-graph-stubs';

/**
 * Image-variants phase 3 — payload-drop proof for the remaining surfaces:
 * discover community rows (banner + mark), the guild page hero, and the
 * profile banner hero. Each slot must request the imgproxy rung that fits
 * its rendered size and never the byte-original.
 *
 * DM bubbles are out of scope by design: DM media is E2E encrypted and
 * decrypted client-side into blob URLs, so CDN variants cannot apply.
 *
 * The CDN is stubbed: variant responses are tiny decodable SVGs, the
 * original /ipfs route serves a 200KB body — any hit on it fails the test.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_BANNER = E2E_PROFILE_BANNER_CID;
const CID_BADGE = 'bafkreibxdtzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34ii';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const ORIGINAL_BYTES = Buffer.alloc(200_000, 'x');

interface CdnHits {
  variantByWidth: Map<string, number>;
  originalByCid: Map<string, number>;
  originalBytes: number;
}

async function stubCdn(page: Page): Promise<CdnHits> {
  const hits: CdnHits = {
    variantByWidth: new Map(),
    originalByCid: new Map(),
    originalBytes: 0,
  };
  const bump = <K>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.variantByWidth, width);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    const cid = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.originalByCid, cid);
    hits.originalBytes += ORIGINAL_BYTES.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: ORIGINAL_BYTES,
    });
  });
  return hits;
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json' as const,
    body: JSON.stringify(data),
  };
}

function guildBrowseRow(index: number, withMedia: boolean) {
  return {
    groupId: `catalog-guild-${index}`,
    ownerId: 'alice.near',
    groupName: `Catalog Guild ${index}`,
    groupDescription: 'A stub guild for Discover browse.',
    groupBannerCid: withMedia ? CID_BANNER : null,
    groupBadgeCid: withMedia ? CID_BADGE : null,
    isPublic: true,
    isMemberDriven: false,
    groupTopics: ['builders'],
    memberCount: 3,
    blockHeight: 1000 - index,
    blockTimestamp: 1,
  };
}

async function stubDiscoverGuildsWithMedia(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    const query = (() => {
      try {
        return String((JSON.parse(raw) as { query?: string }).query ?? '');
      } catch {
        return raw;
      }
    })();

    if (query.includes('BrowseGroups')) {
      await route.fulfill(
        json({
          data: {
            groupsByMemberCount: [
              guildBrowseRow(1, true),
              guildBrowseRow(2, false),
            ],
          },
        })
      );
      return;
    }
    if (query.includes('ProfileStatsBatch') || query.includes('ProfileKinds')) {
      await route.fulfill(
        json({ data: { profileSearch: [], profileKinds: [] } })
      );
      return;
    }
    await route.fulfill(json({ data: {} }));
  });
}

test.describe('image variants on discover + banner surfaces (phase 3)', () => {
  test('discover community rows pick the 128 rung for banner and mark', async ({
    page,
  }) => {
    await stubDiscoverGuildsWithMedia(page);
    const hits = await stubCdn(page);
    await gotoApp(page, '/discover?tab=guilds');
    await dismissNextDevOverlay(page);

    const row = page.getByRole('link', {
      name: 'Catalog Guild 1',
      exact: true,
    });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const banner = row.locator('.community-summary-cover img');
    await expect(banner).toHaveAttribute('src', `${CDN}/ipfs/${CID_BANNER}`);
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/128/ipfs/${CID_BANNER} 128w`)
    );
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_BANNER} 384w`)
    );
    await expect(banner).toHaveAttribute('sizes', '78px');

    // 78px slot at DPR 1 — the browser picks the 128 rung.
    await expect
      .poll(() => banner.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toBe(`${CDN}/img/128/ipfs/${CID_BANNER}`);

    // Square mark rides the fixed 128 variant directly.
    const mark = row.locator('.community-summary-mark img');
    await expect(mark).toHaveAttribute(
      'src',
      `${CDN}/img/128/ipfs/${CID_BADGE}`
    );

    await expect
      .poll(() => hits.variantByWidth.get('128') ?? 0)
      .toBeGreaterThan(0);
    expect(hits.originalByCid.get(CID_BANNER) ?? 0).toBe(0);
    expect(hits.originalByCid.get(CID_BADGE) ?? 0).toBe(0);
  });

  test('guild page hero takes the 1080 rung, badge takes 128', async ({
    page,
  }) => {
    await stubGuildPage(page, {
      bannerCid: CID_BANNER,
      badgeCid: CID_BADGE,
    });
    const hits = await stubCdn(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await dismissNextDevOverlay(page);

    const banner = page.locator('.guild-hero-cover img');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveAttribute('src', `${CDN}/ipfs/${CID_BANNER}`);
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_BANNER} 1080w`)
    );
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1920/ipfs/${CID_BANNER} 1920w`)
    );

    // 1280px viewport → 576px app column at DPR 1 → 1080 rung.
    await expect
      .poll(() => banner.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toBe(`${CDN}/img/1080/ipfs/${CID_BANNER}`);

    const badge = page.locator('.guild-hero-badge img');
    await expect(badge).toHaveAttribute(
      'src',
      `${CDN}/img/128/ipfs/${CID_BADGE}`
    );

    expect(hits.originalByCid.get(CID_BANNER) ?? 0).toBe(0);
    expect(hits.originalByCid.get(CID_BADGE) ?? 0).toBe(0);
  });

  test('profile banner hero takes the 1080 rung from the SSR shell', async ({
    page,
  }) => {
    await setE2eGraphProfile(page, 'banner');
    const hits = await stubCdn(page);
    await gotoApp(page, `/@${E2E_PROFILE_ACCOUNT}`);
    await dismissNextDevOverlay(page);

    const banner = page.locator('.portfolio-profile-banner').first();
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveAttribute('src', `${CDN}/ipfs/${CID_BANNER}`);
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_BANNER} 1080w`)
    );
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1920/ipfs/${CID_BANNER} 1920w`)
    );

    await expect
      .poll(() => banner.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toBe(`${CDN}/img/1080/ipfs/${CID_BANNER}`);

    // Payload drop: the byte-original was never requested anywhere.
    expect(hits.originalBytes).toBe(0);
    console.log(
      `[variants p3] variant hits: ${JSON.stringify(
        Object.fromEntries(hits.variantByWidth)
      )} — original bytes: ${hits.originalBytes}`
    );
  });
});

import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { seedAuthenticatedNotifications } from './helpers/notifications-auth';

/**
 * Image variants g10 — editor one-off previews. The authenticated profile
 * editor shows the profile's existing banner + avatar from CDN originals;
 * both must ride the imgproxy ladder (384/1080 wide, 128/384 mark) and
 * never fetch the byte-original. Fresh picks are blob URLs and bypass the
 * helper, so the create-flow look previews have nothing to prove here.
 *
 * The CDN is stubbed: variant responses are tiny decodable SVGs, the
 * original /ipfs route serves a 200KB body — any hit on it fails the test.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_BANNER =
  'bafkreig10banner000000000000000000000000000000000000000000001';
const CID_AVATAR =
  'bafkreig10avatar000000000000000000000000000000000000000000002';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const ORIGINAL_BYTES = Buffer.alloc(200_000, 'x');

interface CdnHits {
  variantByWidth: Map<string, number>;
  originalBytes: number;
}

async function stubCdn(page: Page): Promise<CdnHits> {
  const hits: CdnHits = { variantByWidth: new Map(), originalBytes: 0 };
  const bump = (key: string) =>
    hits.variantByWidth.set(key, (hits.variantByWidth.get(key) ?? 0) + 1);

  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    bump(new URL(route.request().url()).pathname.split('/')[2]!);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    hits.originalBytes += ORIGINAL_BYTES.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: ORIGINAL_BYTES,
    });
  });
  return hits;
}

async function stubProfileEditorSnapshot(page: Page): Promise<void> {
  await page.route('**/api/profile/editor**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accountId: 'alice.testnet',
        hasProfile: true,
        name: 'Alice',
        location: '',
        industry: '',
        kind: 'person',
        bio: '',
        about: '',
        lead: '',
        aboutAlign: 'left',
        avatarUrl: `${CDN}/ipfs/${CID_AVATAR}`,
        bannerUrl: `${CDN}/ipfs/${CID_BANNER}`,
        bannerMedia: null,
        links: {},
        pageConfig: {},
        tags: [],
        photos: [],
      }),
    });
  });
}

test.describe('editor img variants (g10)', () => {
  test('profile editor banner + avatar ride the variant ladder, never the original', async ({
    page,
  }) => {
    await seedAuthenticatedNotifications(page);
    await stubProfileEditorSnapshot(page);
    const hits = await stubCdn(page);
    await gotoApp(page, '/');
    await dismissNextDevOverlay(page);

    // Dock account zone → account sheet → Account row → Edit profile.
    await page.getByRole('button', { name: /^You, @/ }).click();
    const accountRow = page.getByRole('button', {
      name: /Account[\s\S]*Profile, alerts, log out/,
    });
    await expect(accountRow).toBeVisible({ timeout: 15_000 });
    await accountRow.click();
    const accountMenu = page.getByRole('dialog', { name: 'Account' });
    await expect(accountMenu).toBeVisible({ timeout: 15_000 });
    const editRow = accountMenu.getByRole('button', { name: /Edit profile/ });
    await expect(editRow).toBeVisible();
    await editRow.click();

    const banner = page.locator('.account-editor-banner-image');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveAttribute('src', `${CDN}/ipfs/${CID_BANNER}`);
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_BANNER} 384w`)
    );
    await expect(banner).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_BANNER} 1080w`)
    );
    await expect(banner).toHaveAttribute(
      'sizes',
      '(min-width: 640px) 608px, 100vw'
    );
    // 1280px viewport → 608px app-column bleed at DPR 1 → 1080 rung.
    await expect
      .poll(() => banner.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toBe(`${CDN}/img/1080/ipfs/${CID_BANNER}`);

    const avatar = page.locator('.account-editor-avatar-image');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('src', `${CDN}/ipfs/${CID_AVATAR}`);
    await expect(avatar).toHaveAttribute(
      'srcset',
      new RegExp(`/img/128/ipfs/${CID_AVATAR} 128w`)
    );
    await expect(avatar).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_AVATAR} 384w`)
    );
    await expect(avatar).toHaveAttribute('sizes', '84px');
    // 84px slot at DPR 1 — the browser picks the 128 rung.
    await expect
      .poll(() => avatar.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toBe(`${CDN}/img/128/ipfs/${CID_AVATAR}`);

    // Payload drop: the byte-original was never requested anywhere.
    expect(hits.originalBytes).toBe(0);
    console.log(
      `[variants g10] variant hits: ${JSON.stringify(
        Object.fromEntries(hits.variantByWidth)
      )} — original bytes: ${hits.originalBytes}`
    );
  });
});

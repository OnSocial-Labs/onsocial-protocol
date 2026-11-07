import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphWriting } from './helpers/e2e-graph';

/**
 * Feed identity stays one line: Name @id · time ···
 * Enlarged text may ellipsize; the menu stays on the same baseline.
 * Open-post stacked identity may wrap so the full name stays readable.
 */

type Box = {
  text: string;
  title: string | null;
  top: number;
  left: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
  font: number;
  textOverflow: string;
  whiteSpace: string;
};

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 1 && height > 1;
}

function sameBaseline(a: Box, b: Box): boolean {
  const aMid = (a.top + a.bottom) / 2;
  const bMid = (b.top + b.bottom) / 2;
  return Math.abs(aMid - bMid) < Math.max(a.h, b.h, a.font, b.font) * 0.6;
}

async function readIdentity(scope: Locator) {
  return scope.evaluate((root) => {
    const pick = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        title: el.getAttribute('title'),
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        w: rect.width,
        h: rect.height,
        font: Number.parseFloat(style.fontSize),
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    };
    return {
      name: pick('.post-identity-name'),
      handle: pick('.post-identity-handle'),
      time: pick('.post-identity-time, .post-card-detail-time'),
      menu: pick('.post-identity-trailing, .post-card-menu'),
      row: pick('.post-identity-row'),
      // Allocated flex box — overflowing ellipsized glyphs can paint-clip past
      // their content boxes, so child rects alone are a false collision signal.
      identity: pick('.post-card-identity'),
      timeSlot: pick('.post-identity-time-slot'),
    };
  });
}

async function stubLongPost(page: Page, longName: string, accountId: string) {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [field]: [
              {
                accountId,
                postId: 'long-name-post',
                value: JSON.stringify({ v: 1, text: 'A long byline still has to be read.' }),
                blockHeight: 200,
                blockTimestamp: 1_700_000_000,
                receiptId: 'receipt-long-name-post',
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
                authorName: longName,
                authorAvatar: null,
                groupName: null,
                amplifyHeat: 1,
              },
            ],
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

async function setRootFont(page: Page, px: number) {
  await page.evaluate((size: number) => {
    document.documentElement.style.setProperty('font-size', `${size}px`, 'important');
  }, px);
}

function expectFeedByline(identity: Awaited<ReturnType<typeof readIdentity>>) {
  expect(identity.name?.text.length).toBeGreaterThan(0);
  expect(identity.name!.w).toBeGreaterThan(1);
  expect(identity.handle?.text).toMatch(/^@/);
  expect(identity.time?.text.length).toBeGreaterThan(0);
  expect(identity.menu).not.toBeNull();
  expect(identity.identity).not.toBeNull();
  expect(identity.timeSlot).not.toBeNull();
  expect(sameBaseline(identity.name!, identity.handle!)).toBe(true);
  expect(sameBaseline(identity.handle!, identity.time!)).toBe(true);
  expect(sameBaseline(identity.time!, identity.menu!)).toBe(true);
  // Name before handle inside the cluster; time seat after the profile link;
  // menu after time. Compare allocated flex boxes — ellipsized glyph ink can
  // extend past a clipped child box under overflow:hidden.
  expect(identity.name!.left).toBeLessThan(identity.handle!.left);
  expect(identity.identity!.right).toBeLessThanOrEqual(
    identity.timeSlot!.left + 1
  );
  expect(identity.timeSlot!.right).toBeLessThanOrEqual(identity.menu!.left + 1);
  expect(identity.name!.whiteSpace).toMatch(/nowrap/);
  expect(identity.handle!.whiteSpace).toMatch(/nowrap/);
}

test.describe('post identity feed byline', () => {
  test('keeps name, handle, time, and menu on one feed line', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const card = page.locator('.post-card').filter({ hasText: 'Night drive' });
    await expect(card.first()).toBeVisible();

    const at100 = await readIdentity(card.first());
    expect(at100.name?.text).toBe('Alice');
    expect(at100.handle?.text).toContain('@alice.testnet');
    expectFeedByline(at100);

    await setRootFont(page, 32);
    const at32 = await readIdentity(card.first());
    expect(at32.name?.text).toBe('Alice');
    expect(at32.handle?.text).toContain('@alice.testnet');
    expectFeedByline(at32);
  });

  test('keeps the feed byline on one line at 320px', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const identity = await readIdentity(
      page.locator('.post-card').filter({ hasText: 'Night drive' }).first()
    );
    expect(identity.name?.text).toBe('Alice');
    expectFeedByline(identity);
  });

  test('keeps the open-post name and handle apart at a 32px root font', async ({
    page,
  }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/@alice.testnet/posts/night');
    await dismissNextDevOverlay(page);
    await setRootFont(page, 32);
    const identity = await readIdentity(page.locator('.post-identity--stacked').first());
    expect(identity.name?.text).toBe('Alice');
    expect(identity.handle?.text).toContain('@alice.testnet');
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    const time = await readIdentity(page.locator('.post-card').first());
    expect(time.time?.text.length).toBeGreaterThan(0);
    expect(overlaps(identity.handle!, time.time!)).toBe(false);
  });

  test('ellipsizes a long feed byline and keeps the menu on the line', async ({
    page,
  }) => {
    const longName = 'Alexandria Nightingale Montgomery';
    const accountId = 'alexandria-nightingale.testnet';
    await stubLongPost(page, longName, accountId);

    await page.setViewportSize({ width: 320, height: 700 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();
    const card = page.locator('.post-card').filter({ hasText: /Alexandria|Nightingale/ }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await setRootFont(page, 32);
    const identity = await readIdentity(card);
    expect(identity.name?.title || identity.name?.text).toContain('Alexandria');
    expect(identity.handle?.title || identity.handle?.text).toContain(`@${accountId}`);
    expectFeedByline(identity);
    expect(
      identity.name!.textOverflow === 'ellipsis' ||
        identity.handle!.textOverflow === 'ellipsis' ||
        (identity.name!.title != null && identity.name!.text.length < longName.length) ||
        (identity.handle!.title != null &&
          identity.handle!.text.length < `@${accountId}`.length)
    ).toBe(true);

    const profile = card.locator('a.post-card-identity');
    await expect(profile).toHaveAttribute('aria-label', `View ${longName}, @${accountId}`);
    await expect(profile).toHaveAttribute('href', new RegExp(accountId));
    await profile.focus();
    await expect(profile).toBeFocused();
  });

  test('keeps a long feed byline on one line at 390px', async ({ page }) => {
    const longName = 'Alexandria Nightingale Montgomery';
    const accountId = 'alexandria-nightingale.testnet';
    await stubLongPost(page, longName, accountId);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();
    const card = page.locator('.post-card').filter({ hasText: /Alexandria|Nightingale/ }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await setRootFont(page, 32);
    const identity = await readIdentity(card);
    expect(identity.handle?.title || identity.handle?.text).toContain(`@${accountId}`);
    expectFeedByline(identity);
  });
});

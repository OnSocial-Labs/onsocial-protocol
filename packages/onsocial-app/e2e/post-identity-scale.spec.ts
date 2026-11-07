import { expect, test, type Locator } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphWriting } from './helpers/e2e-graph';

/**
 * Author name, handle, and time stay readable when text is enlarged.
 * The 32px root font is a text-size resize. It is not a browser zoom.
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
  textW: number;
  textH: number;
  font: number;
};

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 1 && height > 1;
}

function readable(box: Box): boolean {
  return box.w > 1 && box.h > 1 && box.textW >= box.font * 0.5 && box.textH >= box.font * 0.6;
}

async function readIdentity(scope: Locator) {
  return scope.evaluate((root) => {
    const pick = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const textRect = range.getBoundingClientRect();
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
        textW: textRect.width,
        textH: textRect.height,
        font: Number.parseFloat(style.fontSize),
      };
    };
    return {
      name: pick('.post-identity-name'),
      handle: pick('.post-identity-handle'),
      time: pick('.post-identity-time, .post-card-detail-time'),
    };
  });
}

async function setRootFont(page: Page, px: number) {
  await page.evaluate((size) => {
    document.documentElement.style.setProperty('font-size', `${size}px`, 'important');
  }, px);
}

test.describe('post identity at enlarged text', () => {
  test('keeps Alice readable on the feed at 100% and at a 32px root font', async ({
    page,
  }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const card = page.locator('.post-card').filter({ hasText: 'Night drive' });
    await expect(card.first()).toBeVisible();

    const at100 = await readIdentity(card.first());
    expect(at100.name?.text).toBe('Alice');
    expect(at100.handle?.text).toContain('@alice.testnet');
    expect(at100.time?.text.length).toBeGreaterThan(0);
    expect(readable(at100.name!)).toBe(true);
    expect(readable(at100.handle!)).toBe(true);
    expect(readable(at100.time!)).toBe(true);
    expect(overlaps(at100.name!, at100.handle!)).toBe(false);
    expect(overlaps(at100.handle!, at100.time!)).toBe(false);
    expect(overlaps(at100.name!, at100.time!)).toBe(false);
    expect(Math.abs(at100.name!.top - at100.handle!.top)).toBeLessThan(at100.name!.font);

    await setRootFont(page, 32);
    const at32 = await readIdentity(card.first());
    expect(at32.name?.text).toBe('Alice');
    expect(at32.name?.title).toBe('Alice');
    expect(at32.handle?.text).toContain('@alice.testnet');
    expect(at32.handle?.title).toContain('@alice.testnet');
    expect(readable(at32.name!)).toBe(true);
    expect(readable(at32.handle!)).toBe(true);
    expect(readable(at32.time!)).toBe(true);
    expect(overlaps(at32.name!, at32.handle!)).toBe(false);
    expect(overlaps(at32.handle!, at32.time!)).toBe(false);
    expect(overlaps(at32.name!, at32.time!)).toBe(false);
  });

  test('keeps Alice readable at 320px with a 32px root font', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await setRootFont(page, 32);
    const identity = await readIdentity(
      page.locator('.post-card').filter({ hasText: 'Night drive' }).first()
    );
    expect(identity.name?.text).toBe('Alice');
    expect(readable(identity.name!)).toBe(true);
    expect(readable(identity.handle!)).toBe(true);
    expect(readable(identity.time!)).toBe(true);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    expect(overlaps(identity.handle!, identity.time!)).toBe(false);
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
    expect(readable(identity.name!)).toBe(true);
    expect(readable(identity.handle!)).toBe(true);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    const time = await readIdentity(page.locator('.post-card').first());
    expect(time.time?.text.length).toBeGreaterThan(0);
    expect(readable(time.time!)).toBe(true);
    expect(overlaps(identity.handle!, time.time!)).toBe(false);
  });

  test('keeps a long name and handle readable at 320px', async ({ page }) => {
    const longName = 'Alexandria Nightingale Montgomery';
    const accountId = 'alexandria-nightingale.testnet';
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

    await page.setViewportSize({ width: 320, height: 700 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();
    const card = page.locator('.post-card').filter({ hasText: longName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await setRootFont(page, 32);
    const identity = await readIdentity(card);
    expect(identity.name?.text).toBe(longName);
    expect(identity.name?.title).toBe(longName);
    expect(identity.handle?.text).toContain(`@${accountId}`);
    expect(identity.handle?.title).toContain(`@${accountId}`);
    expect(readable(identity.name!)).toBe(true);
    expect(readable(identity.handle!)).toBe(true);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    if (identity.time) {
      expect(readable(identity.time)).toBe(true);
      expect(overlaps(identity.name!, identity.time)).toBe(false);
      expect(overlaps(identity.handle!, identity.time)).toBe(false);
    }
  });
});

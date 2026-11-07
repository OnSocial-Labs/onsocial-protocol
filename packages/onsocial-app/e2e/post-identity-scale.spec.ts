import { expect, test, type Locator, type Page } from '@playwright/test';
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
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  textOverflow: string;
};

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 1 && height > 1;
}

/** The full string is on screen. A clipped or ellipsized box fails. */
function fullyVisible(box: Box): boolean {
  return (
    box.clientWidth > 1 &&
    box.clientHeight > 1 &&
    box.scrollWidth <= box.clientWidth + 1 &&
    box.scrollHeight <= box.clientHeight + 1 &&
    box.textOverflow !== 'ellipsis' &&
    box.text.length > 0
  );
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
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        textOverflow: style.textOverflow,
      };
    };
    return {
      name: pick('.post-identity-name'),
      handle: pick('.post-identity-handle'),
      time: pick('.post-identity-time, .post-card-detail-time'),
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

async function applyTextSpacing(page: Page) {
  await page.addStyleTag({
    content: `
      .post-identity, .post-identity-name, .post-identity-handle, .post-identity-time,
      .post-card-detail-time, .post-card-body, p {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      .post-card-body, p {
        margin-bottom: 2em !important;
      }
    `,
  });
}

async function setRootFont(page: Page, px: number) {
  await page.evaluate((size: number) => {
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
    expect(fullyVisible(at100.name!)).toBe(true);
    expect(fullyVisible(at100.handle!)).toBe(true);
    expect(fullyVisible(at100.time!)).toBe(true);
    expect(overlaps(at100.name!, at100.handle!)).toBe(false);
    expect(overlaps(at100.handle!, at100.time!)).toBe(false);
    expect(overlaps(at100.name!, at100.time!)).toBe(false);
    expect(Math.abs(at100.name!.top - at100.handle!.top)).toBeLessThan(at100.name!.font);

    await setRootFont(page, 32);
    const at32 = await readIdentity(card.first());
    expect(at32.name?.text).toBe('Alice');
    expect(at32.handle?.text).toContain('@alice.testnet');
    expect(fullyVisible(at32.name!)).toBe(true);
    expect(fullyVisible(at32.handle!)).toBe(true);
    expect(fullyVisible(at32.time!)).toBe(true);
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
    expect(fullyVisible(identity.name!)).toBe(true);
    expect(fullyVisible(identity.handle!)).toBe(true);
    expect(fullyVisible(identity.time!)).toBe(true);
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
    expect(fullyVisible(identity.name!)).toBe(true);
    expect(fullyVisible(identity.handle!)).toBe(true);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    const time = await readIdentity(page.locator('.post-card').first());
    expect(time.time?.text.length).toBeGreaterThan(0);
    expect(fullyVisible(time.time!)).toBe(true);
    expect(overlaps(identity.handle!, time.time!)).toBe(false);
  });

  test('keeps a long name and handle readable at 320px', async ({ page }) => {
    const longName = 'Alexandria Nightingale Montgomery';
    const accountId = 'alexandria-nightingale.testnet';
    await stubLongPost(page, longName, accountId);

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
    expect(identity.handle?.text).toContain(`@${accountId}`);
    expect(fullyVisible(identity.name!)).toBe(true);
    expect(fullyVisible(identity.handle!)).toBe(true);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
    if (identity.time) {
      expect(fullyVisible(identity.time)).toBe(true);
      expect(overlaps(identity.name!, identity.time)).toBe(false);
      expect(overlaps(identity.handle!, identity.time)).toBe(false);
    }
    const profile = card.locator('a.post-card-identity');
    await expect(profile).toHaveAttribute('aria-label', `View ${longName}, @${accountId}`);
    await expect(profile).toHaveAttribute('href', new RegExp(accountId));
    await profile.focus();
    await expect(profile).toBeFocused();
    const touchReachesLink = await card.locator('.post-identity-handle').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + 4, rect.top + Math.min(8, rect.height / 2));
      return Boolean(hit && (el.contains(hit) || hit.closest('a.post-card-identity')));
    });
    expect(touchReachesLink).toBe(true);
  });

  test('keeps a long name and handle fully visible at 390px with a 32px root font', async ({
    page,
  }) => {
    const longName = 'Alexandria Nightingale Montgomery';
    const accountId = 'alexandria-nightingale.testnet';
    await stubLongPost(page, longName, accountId);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();
    const card = page.locator('.post-card').filter({ hasText: longName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await setRootFont(page, 32);
    const identity = await readIdentity(card);
    expect(fullyVisible(identity.name!)).toBe(true);
    expect(fullyVisible(identity.handle!)).toBe(true);
    expect(identity.handle?.text).toContain(`@${accountId}`);
    expect(overlaps(identity.name!, identity.handle!)).toBe(false);
  });

  test('keeps identity text when standard text spacing is applied', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const card = page.locator('.post-card').filter({ hasText: 'Night drive' }).first();
    await applyTextSpacing(page);
    const at100 = await readIdentity(card);
    expect(at100.name?.text).toBe('Alice');
    expect(at100.handle?.text).toContain('@alice.testnet');
    expect(fullyVisible(at100.name!)).toBe(true);
    expect(fullyVisible(at100.handle!)).toBe(true);
    expect(fullyVisible(at100.time!)).toBe(true);
    expect(overlaps(at100.name!, at100.handle!)).toBe(false);
    expect(overlaps(at100.handle!, at100.time!)).toBe(false);

    await setRootFont(page, 32);
    const at32 = await readIdentity(card);
    expect(fullyVisible(at32.name!)).toBe(true);
    expect(fullyVisible(at32.handle!)).toBe(true);
    expect(fullyVisible(at32.time!)).toBe(true);
    expect(overlaps(at32.name!, at32.handle!)).toBe(false);
    expect(overlaps(at32.handle!, at32.time!)).toBe(false);

    await page.setViewportSize({ width: 320, height: 700 });
    const narrow = await readIdentity(card);
    expect(fullyVisible(narrow.name!)).toBe(true);
    expect(fullyVisible(narrow.handle!)).toBe(true);
    expect(fullyVisible(narrow.time!)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await setRootFont(page, 16);
    await gotoApp(page, '/@alice.testnet/posts/night');
    await dismissNextDevOverlay(page);
    await applyTextSpacing(page);
    const open100 = await readIdentity(page.locator('.post-identity--stacked').first());
    expect(open100.name?.text).toBe('Alice');
    expect(fullyVisible(open100.name!)).toBe(true);
    expect(fullyVisible(open100.handle!)).toBe(true);
    expect(overlaps(open100.name!, open100.handle!)).toBe(false);
    await setRootFont(page, 32);
    const open32 = await readIdentity(page.locator('.post-identity--stacked').first());
    expect(fullyVisible(open32.name!)).toBe(true);
    expect(fullyVisible(open32.handle!)).toBe(true);
    const openTime = await readIdentity(page.locator('.post-card').first());
    expect(fullyVisible(openTime.time!)).toBe(true);
    const openLink = page.locator('a.post-card-identity').first();
    await expect(openLink).toHaveAttribute('aria-label', /Alice, @alice\.testnet/);
    await openLink.focus();
    await expect(openLink).toBeFocused();
  });
});

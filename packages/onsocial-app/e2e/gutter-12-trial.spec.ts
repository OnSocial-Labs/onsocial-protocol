import { expect, test, type Page } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import { dismissNextDevOverlay, gotoApp } from './helpers';

const CDN = 'https://cdn.testnet.onsocial.id';
const PHOTO_POST = {
  accountId: 'alice.near',
  postId: 'gutter-trial-photo',
  value: JSON.stringify({
    v: 1,
    text: 'Gutter trial photo post with a long handle @alice.near',
    media: [
      {
        cid: 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni',
        mime: 'image/jpeg',
        size: 200_000,
      },
    ],
  }),
  blockHeight: 200,
  blockTimestamp: 1_700_000_000,
  receiptId: 'receipt-gutter-trial-photo',
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
  authorName: 'Alice',
  authorAvatar: null,
  groupName: null,
  amplifyHeat: 1,
};

async function stubFeed(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
    };
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [PHOTO_POST] } }),
      });
      return;
    }
    await route.continue();
  });
  await page.route(`${CDN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#36c"/></svg>',
    });
  });
}

test.describe('12px gutter trial', () => {
  test.beforeEach(async ({ page }) => {
    await stubFeed(page);
  });

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
  ]) {
    test(`ordinary feed, launcher, and dock are 12px at ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoApp(page, '/home');
      await dismissNextDevOverlay(page);
      let feed: {
        missing?: string[];
        gutter?: string;
        rootFont?: number;
        padLeft?: number;
        padRight?: number;
        dockLeft?: number;
        dockRight?: number;
        contentLeft?: number;
        contentRight?: number;
        avatarLeft?: number;
        avatarRight?: number;
        textLeft?: number;
        textRight?: number;
        mediaLeft?: number;
        mediaRight?: number;
      } = {};
      await expect
        .poll(async () => {
          feed = await page.evaluate(() => {
            const pageEl = document.querySelector(
              '.home-feed.os-app-chrome-page'
            );
            const cardEl = document.querySelector(
              '.post-card:not(.post-card--skeleton):has(.post-media-strip)'
            );
            const avatar = cardEl?.querySelector('.post-card-avatar') ?? null;
            const text = cardEl?.querySelector('.post-card-body') ?? null;
            const media = cardEl?.querySelector('.post-media-strip') ?? null;
            const dock = document.querySelector('.portfolio-summon-dock');
            const missing = [
              pageEl ? '' : 'page',
              avatar ? '' : 'avatar',
              text ? '' : 'text',
              media ? '' : 'media',
              dock ? '' : 'dock',
            ].filter(Boolean);
            if (
              !(pageEl instanceof HTMLElement) ||
              !(avatar instanceof HTMLElement) ||
              !(text instanceof HTMLElement) ||
              !(media instanceof HTMLElement) ||
              !(dock instanceof HTMLElement)
            ) {
              return { missing };
            }
            const rootFont = parseFloat(
              getComputedStyle(document.documentElement).fontSize
            );
            const pageStyle = getComputedStyle(pageEl);
            const dockStyle = getComputedStyle(dock);
            const avatarBox = avatar.getBoundingClientRect();
            const textBox = text.getBoundingClientRect();
            const mediaBox = media.getBoundingClientRect();
            const pageBox = pageEl.getBoundingClientRect();
            return {
              gutter: getComputedStyle(pageEl)
                .getPropertyValue('--os-gutter')
                .trim(),
              rootFont,
              padLeft: parseFloat(pageStyle.paddingLeft),
              padRight: parseFloat(pageStyle.paddingRight),
              dockLeft: parseFloat(dockStyle.paddingLeft),
              dockRight: parseFloat(dockStyle.paddingRight),
              contentLeft: pageBox.left + parseFloat(pageStyle.paddingLeft),
              contentRight: pageBox.right - parseFloat(pageStyle.paddingRight),
              avatarLeft: avatarBox.left,
              avatarRight: avatarBox.right,
              textLeft: textBox.left,
              textRight: textBox.right,
              mediaLeft: mediaBox.left,
              mediaRight: mediaBox.right,
            };
          });
          return feed.missing?.length ? feed.missing.join(',') : 'ok';
        })
        .toBe('ok');

      expect(feed.missing ?? []).toEqual([]);
      const expected = (feed?.rootFont ?? 16) * 0.75;
      expect(parseFloat(feed?.gutter ?? '')).toBeCloseTo(0.75, 2);
      expect(feed?.padLeft).toBeCloseTo(expected, 1);
      expect(feed?.padRight).toBeCloseTo(expected, 1);
      expect(feed?.dockLeft).toBeCloseTo(expected, 1);
      expect(feed?.dockRight).toBeCloseTo(expected, 1);
      expect(
        Math.abs((feed?.avatarLeft ?? 0) - (feed?.contentLeft ?? 0))
      ).toBeLessThanOrEqual(1.5);
      expect((feed?.textLeft ?? 0) - (feed?.avatarRight ?? 0)).toBeCloseTo(
        (feed?.rootFont ?? 16) * 0.75,
        0
      );
      expect(feed?.mediaLeft).toBeCloseTo(feed?.textLeft ?? 0, 0);
      expect(feed?.mediaRight ?? 0).toBeLessThanOrEqual(
        (feed?.contentRight ?? 0) + 1
      );
      expect(feed?.textRight ?? 0).toBeLessThanOrEqual(
        (feed?.contentRight ?? 0) + 1
      );

      await page.getByRole('button', { name: 'Open launcher' }).click();
      const launcher = page.getByRole('dialog', { name: /launcher/i });
      await expect(launcher).toBeVisible();
      const launcherPad = await launcher
        .locator('.os-launcher-grid')
        .first()
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            left: parseFloat(style.paddingLeft),
            right: parseFloat(style.paddingRight),
          };
        });
      expect(launcherPad.left).toBeCloseTo(expected, 1);
      expect(launcherPad.right).toBeCloseTo(expected, 1);
    });
  }

  test('desktop column width and centering stay on the 36rem card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await expect(page.locator('.post-card').first()).toBeVisible({
      timeout: 20_000,
    });

    const column = await page.evaluate(() => {
      const surface = document.querySelector('.os-app-screen.app-surface');
      const pageEl = document.querySelector('.home-feed.os-app-chrome-page');
      if (
        !(surface instanceof HTMLElement) ||
        !(pageEl instanceof HTMLElement)
      ) {
        return null;
      }
      const rootFont = parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      const box = surface.getBoundingClientRect();
      const style = getComputedStyle(pageEl);
      return {
        width: box.width,
        expected: rootFont * 36,
        leftGap: box.left,
        rightGap: window.innerWidth - box.right,
        padLeft: parseFloat(style.paddingLeft),
        padRight: parseFloat(style.paddingRight),
        gutter: getComputedStyle(pageEl).getPropertyValue('--os-gutter').trim(),
        rootFont,
      };
    });

    expect(column).not.toBeNull();
    expect(parseFloat(column?.gutter ?? '')).toBeCloseTo(0.75, 2);
    expect(column?.width).toBeCloseTo(column?.expected ?? 0, 0);
    expect(column?.leftGap).toBeCloseTo(column?.rightGap ?? 0, 0);
    expect(column?.padLeft).toBeCloseTo((column?.rootFont ?? 16) * 0.75, 1);
    expect(column?.padRight).toBeCloseTo((column?.rootFont ?? 16) * 0.75, 1);
  });

  test('wallet and storage sheets keep 16px on both sides', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eWallet(page, 'alice.near');
    await gotoApp(page, '/home?sheet=wallet');
    await dismissNextDevOverlay(page);
    const wallet = page.locator('.account-drawer-panel');
    await expect(wallet).toBeVisible({ timeout: 20_000 });

    const walletPad = await wallet.evaluate((panel) => {
      const header = panel.querySelector('.account-drawer-header');
      const body = panel.querySelector('.os-hug-sheet-body');
      if (!(header instanceof HTMLElement) || !(body instanceof HTMLElement)) {
        return null;
      }
      const rootFont = parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      const headerStyle = getComputedStyle(header);
      const bodyStyle = getComputedStyle(body);
      return {
        rootFont,
        gutter: getComputedStyle(panel).getPropertyValue('--os-gutter').trim(),
        rootGutter: getComputedStyle(document.documentElement)
          .getPropertyValue('--os-gutter')
          .trim(),
        headerLeft: parseFloat(headerStyle.paddingLeft),
        headerRight: parseFloat(headerStyle.paddingRight),
        bodyLeft: parseFloat(bodyStyle.paddingLeft),
        bodyRight: parseFloat(bodyStyle.paddingRight),
      };
    });

    expect(walletPad).not.toBeNull();
    const kept = walletPad?.rootFont ?? 16;
    expect(parseFloat(walletPad?.gutter ?? '')).toBeCloseTo(1, 2);
    expect(parseFloat(walletPad?.rootGutter ?? '')).toBeCloseTo(0.75, 2);
    expect(walletPad?.headerLeft).toBeCloseTo(kept, 1);
    expect(walletPad?.headerRight).toBeCloseTo(kept, 1);
    expect(walletPad?.bodyLeft).toBeCloseTo(kept, 1);
    expect(walletPad?.bodyRight).toBeCloseTo(kept, 1);

    const storageButton = page.getByRole('button', { name: /^Storage/ });
    await expect(storageButton).toBeEnabled({ timeout: 20_000 });
    await storageButton.click();
    const storage = page.locator('.account-storage-panel');
    await expect(storage).toBeVisible({ timeout: 20_000 });
    const storagePad = await storage
      .locator('.os-hug-sheet-body')
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const panel = el.closest('.account-storage-panel');
        return {
          left: parseFloat(style.paddingLeft),
          right: parseFloat(style.paddingRight),
          gutter:
            panel instanceof HTMLElement
              ? getComputedStyle(panel).getPropertyValue('--os-gutter').trim()
              : '',
        };
      });
    expect(storagePad.gutter).toBe('1rem');
    expect(storagePad.left).toBeCloseTo(kept, 1);
    expect(storagePad.right).toBeCloseTo(kept, 1);
  });

  test('phone icon hit stays 44 and the primary control stays 48', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eWallet(page, 'alice.near');
    await gotoApp(page, '/home?sheet=wallet');
    await dismissNextDevOverlay(page);
    const wallet = page.locator('.account-drawer-panel');
    await expect(wallet).toBeVisible({ timeout: 20_000 });

    const hits = await page.evaluate(() => {
      const icon = document.querySelector(
        '.account-drawer-panel .glass-sheet-icon-action'
      );
      const primary = document.querySelector('.account-wallet-action');
      const probe = document.createElement('div');
      probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
      probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
      document.body.appendChild(probe);
      const probeStyle = getComputedStyle(probe);
      const safeLeft = parseFloat(probeStyle.paddingLeft);
      const safeRight = parseFloat(probeStyle.paddingRight);
      probe.remove();
      const iconBox =
        icon instanceof HTMLElement ? icon.getBoundingClientRect() : null;
      const primaryBox =
        primary instanceof HTMLElement ? primary.getBoundingClientRect() : null;
      const primaryStyle =
        primary instanceof HTMLElement ? getComputedStyle(primary) : null;
      return {
        iconW: iconBox?.width ?? null,
        iconH: iconBox?.height ?? null,
        primaryH: primaryBox?.height ?? null,
        primaryMin: primaryStyle ? parseFloat(primaryStyle.minHeight) : null,
        safeLeft,
        safeRight,
      };
    });

    expect(hits.iconW).toBeGreaterThanOrEqual(44);
    expect(hits.iconH).toBeGreaterThanOrEqual(44);
    expect(hits.primaryH).toBeGreaterThanOrEqual(48);
    expect(hits.primaryMin).toBeGreaterThanOrEqual(48);
    expect(hits.safeLeft).toBe(0);
    expect(hits.safeRight).toBe(0);

    const close = wallet.getByRole('button', { name: /close/i }).first();
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const focus = await close.evaluate((el) => {
      el.focus();
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        outline: style.outlineStyle,
        shadow: style.boxShadow,
        visible: el.matches(':focus-visible'),
        width: parseFloat(style.outlineWidth),
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        height: window.innerHeight,
        widthPx: window.innerWidth,
      };
    });
    expect(focus.visible || focus.shadow !== 'none').toBe(true);
    expect(focus.shadow).not.toBe('none');
    expect(focus.top).toBeGreaterThanOrEqual(0);
    expect(focus.bottom).toBeLessThanOrEqual(focus.height);
    expect(focus.left).toBeGreaterThanOrEqual(0);
    expect(focus.right).toBeLessThanOrEqual(focus.widthPx);
  });

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`support sheet is 16px left and right at ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedE2eWallet(page, 'alice.near');
      await gotoApp(page, '/@greenghost.onsocial.testnet');
      await dismissNextDevOverlay(page);
      const support = page.getByRole('button', { name: /^Support/ }).first();
      await expect(support).toBeVisible({ timeout: 20_000 });
      await support.click();
      const sheet = page.locator('.os-gesture-sheet-panel');
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      const pad = await sheet.evaluate((panel) => {
        const read = (el: Element | null) => {
          if (!(el instanceof HTMLElement)) return null;
          const style = getComputedStyle(el);
          return {
            left: parseFloat(style.paddingLeft),
            right: parseFloat(style.paddingRight),
          };
        };
        const style = getComputedStyle(panel);
        return {
          gutter: style.getPropertyValue('--os-gutter').trim(),
          padX: style.getPropertyValue('--os-screen-body-pad-x').trim(),
          sheetPad: style.getPropertyValue('--os-sheet-pad-inline').trim(),
          footerPad: style
            .getPropertyValue('--os-sheet-footer-pad-inline')
            .trim(),
          header: read(panel.querySelector('.glass-sheet-header')),
          body: read(panel.querySelector('.os-gesture-sheet-body')),
          footer: read(panel.querySelector('.os-sheet-footer')),
        };
      });
      expect(parseFloat(pad.gutter)).toBeCloseTo(1, 2);
      expect(parseFloat(pad.padX)).toBeCloseTo(1, 2);
      expect(parseFloat(pad.sheetPad)).toBeCloseTo(1, 2);
      expect(parseFloat(pad.footerPad)).toBeCloseTo(1, 2);
      for (const edge of [pad.header, pad.body, pad.footer]) {
        expect(edge).not.toBeNull();
        expect(edge?.left).toBeCloseTo(16, 1);
        expect(edge?.right).toBeCloseTo(16, 1);
      }
    });
  }
});

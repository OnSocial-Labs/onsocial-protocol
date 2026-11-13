import { expect, test, type Page } from '@playwright/test';
import {
  clearComposerThreadDrafts,
  clickAddThreadBeat,
  openHomePostComposer,
} from './helpers/compose-thread';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import { seedE2eMockSigner } from './helpers/e2e-mock-signer';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Header bottom → first avatar. Phone viewport: the open Post page and
 * every composer mode share one gap (within 1px). A second beat keeps a
 * 0.2rem rail gap on each side of the avatars, with the rail centred.
 */
test.use({
  viewport: { width: 390, height: 664 },
  isMobile: true,
  hasTouch: true,
});

async function settle(page: Page) {
  await dismissNextDevOverlay(page);
  await page.evaluate(() => document.fonts.ready);
  const panel = page.locator('.guild-composer-sheet-panel');
  if ((await panel.count()) > 0) {
    await expect(panel).toBeVisible();
    await expect
      .poll(async () =>
        panel.evaluate((node) => {
          if (!node.classList.contains('is-open')) return false;
          if (node.classList.contains('glass-sheet-panel--enter')) return false;
          const style = getComputedStyle(node);
          if (Number.parseFloat(style.opacity) < 1) return false;
          const matrix = new DOMMatrix(style.transform);
          return Math.abs(matrix.m41) <= 1 && Math.abs(matrix.m42) <= 1;
        })
      )
      .toBe(true);
    await panel.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => undefined))
      );
    });
  }
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body)
      active.blur();
  });
  const beats = page.locator('.guild-composer-thread-item');
  if ((await beats.count()) > 0) {
    await beats.evaluateAll(async (nodes) => {
      await Promise.all(
        nodes.flatMap((node) =>
          node
            .getAnimations()
            .map((animation) => animation.finished.catch(() => undefined))
        )
      );
    });
  }
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const panel = document.querySelector('.guild-composer-sheet-panel');
        const panelOpen =
          panel instanceof HTMLElement && panel.classList.contains('is-open');
        const root = panelOpen
          ? panel
          : document.querySelector(
              '.os-app-screen:not(.os-app-screen--embedded)'
            );
        const body = root?.querySelector('.os-app-screen-body');
        return body instanceof HTMLElement ? body.scrollTop : -1;
      })
    )
    .toBe(0);
}

async function headerToAvatarGap(page: Page, surface: 'post' | 'composer') {
  return page.evaluate((which) => {
    const sheet = document.querySelector('.guild-composer-sheet-panel');
    const root =
      which === 'composer' && sheet
        ? sheet
        : document.querySelector(
            '.os-app-screen:not(.os-app-screen--embedded)'
          );
    const header = root?.querySelector('.os-app-screen-header');
    const avatar =
      which === 'composer'
        ? sheet?.querySelector('.guild-composer-row-avatar')
        : document.querySelector('.guild-thread-root .post-card-avatar');
    if (!header || !avatar) return null;
    return (
      avatar.getBoundingClientRect().top - header.getBoundingClientRect().bottom
    );
  }, surface);
}

function expectSameGap(actual: number | null, expected: number) {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1);
}

/** Painted rail box for a pseudo, from the item's border box plus used top/height. */
function continuationRails(page: Page) {
  return page.evaluate(() => {
    const font = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const items = [...document.querySelectorAll('.guild-composer-thread-item')];
    if (items.length < 2) return null;

    const railBox = (item: Element, pseudo: '::before' | '::after') => {
      const style = getComputedStyle(item, pseudo);
      if (style.content === 'none' || style.content === 'normal') return null;
      const itemRect = item.getBoundingClientRect();
      const top = Number.parseFloat(style.top);
      const height = Number.parseFloat(style.height);
      const left = Number.parseFloat(style.left);
      const width = Number.parseFloat(style.width);
      if (![top, height, left, width].every(Number.isFinite)) return null;
      if (height <= 0 || width <= 0) return null;
      return {
        top: itemRect.top + top,
        bottom: itemRect.top + top + height,
        centerX: itemRect.left + left + width / 2,
      };
    };

    const gaps: Array<{
      side: 'above' | 'below';
      gap: number;
      railCenterX: number;
      avatarCenterX: number;
    }> = [];
    for (const item of items) {
      const avatar = item.querySelector('.guild-composer-row-avatar');
      if (!avatar) return null;
      const box = avatar.getBoundingClientRect();
      if (box.height <= 0) return null;
      const centerX = box.left + box.width / 2;
      const above = railBox(item, '::before');
      const below = railBox(item, '::after');
      if (above) {
        gaps.push({
          side: 'above',
          gap: box.top - above.bottom,
          railCenterX: above.centerX,
          avatarCenterX: centerX,
        });
      }
      if (below) {
        gaps.push({
          side: 'below',
          gap: below.top - box.bottom,
          railCenterX: below.centerX,
          avatarCenterX: centerX,
        });
      }
    }
    return { gaps, expectedGap: 0.2 * font };
  });
}

test('composer first avatar matches the Post page gap @webkit', async ({
  page,
}) => {
  await setE2eGraphWriting(page, 'shelf');
  await clearComposerThreadDrafts(page);
  await seedE2eMockSigner(page, 'alice.testnet');

  await gotoApp(page, '/@alice.testnet/posts/night');
  await dismissNextDevOverlay(page);
  await page.locator('.guild-thread-root .post-card-avatar').waitFor({
    state: 'visible',
  });
  await settle(page);
  const postPageGap = await headerToAvatarGap(page, 'post');
  expect(postPageGap).not.toBeNull();

  const root = page.locator('.guild-thread-root');
  await root.getByRole('button', { name: 'Reply to this post' }).click();
  await page.getByRole('button', { name: 'Open full composer' }).click();
  await page
    .getByRole('dialog', { name: 'Reply' })
    .waitFor({ state: 'visible' });
  await settle(page);
  expectSameGap(await headerToAvatarGap(page, 'composer'), postPageGap!);

  await page.getByRole('option', { name: 'Quote' }).click();
  await page
    .getByRole('dialog', { name: 'Quote' })
    .waitFor({ state: 'visible' });
  await settle(page);
  expectSameGap(await headerToAvatarGap(page, 'composer'), postPageGap!);

  await openHomePostComposer(page);
  await settle(page);
  expectSameGap(await headerToAvatarGap(page, 'composer'), postPageGap!);

  await page.getByRole('option', { name: 'Article' }).click();
  await page.getByRole('dialog', { name: 'New article' }).waitFor({
    state: 'visible',
  });
  await settle(page);
  expectSameGap(await headerToAvatarGap(page, 'composer'), postPageGap!);

  await page.getByRole('option', { name: 'Post' }).click();
  await page
    .getByRole('dialog', { name: 'New post' })
    .waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'Share something…' }).fill('hello');
  await clickAddThreadBeat(page);
  await settle(page);

  const continuation = await continuationRails(page);
  expect(continuation).not.toBeNull();
  expect(continuation!.gaps.length).toBeGreaterThanOrEqual(2);
  const above = continuation!.gaps.filter((gap) => gap.side === 'above');
  const below = continuation!.gaps.filter((gap) => gap.side === 'below');
  expect(above.length).toBeGreaterThanOrEqual(1);
  expect(below.length).toBeGreaterThanOrEqual(1);
  for (const gap of continuation!.gaps) {
    expect(
      Math.abs(gap.gap - continuation!.expectedGap),
      `${gap.side} rail gap ${gap.gap}px, expected ${continuation!.expectedGap}px`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(gap.railCenterX - gap.avatarCenterX),
      `${gap.side} rail centre ${gap.railCenterX} vs avatar ${gap.avatarCenterX}`
    ).toBeLessThanOrEqual(1);
  }
  const firstGap = continuation!.gaps[0]!.gap;
  for (const gap of continuation!.gaps) {
    expect(Math.abs(gap.gap - firstGap)).toBeLessThanOrEqual(1);
  }
});

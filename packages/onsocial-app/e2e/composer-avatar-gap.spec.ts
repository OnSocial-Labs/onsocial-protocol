import { expect, test, type Page } from '@playwright/test';
import {
  clearComposerThreadDrafts,
  openHomePostComposer,
} from './helpers/compose-thread';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import { seedE2eMockSigner } from './helpers/e2e-mock-signer';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Header bottom → first avatar. Phone viewport: the open Post page and
 * every composer mode share one gap (within 1px).
 */
test.use({
  viewport: { width: 390, height: 664 },
  isMobile: true,
  hasTouch: true,
});

async function settle(page: Page) {
  await page.waitForTimeout(350);
  await dismissNextDevOverlay(page);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    for (const node of document.querySelectorAll('.os-app-screen-body')) {
      if (node instanceof HTMLElement) node.scrollTop = 0;
    }
  });
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

test('composer first avatar matches the Post page gap', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Add to thread' }).evaluate((el) => {
    if (el instanceof HTMLButtonElement) el.click();
  });
  await page
    .getByRole('textbox', { name: 'Post 2' })
    .waitFor({ state: 'visible' });
  await settle(page);

  const continuation = await page.evaluate(() => {
    const font = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const items = [...document.querySelectorAll('.guild-composer-thread-item')];
    const first = items[0];
    const second = items[1];
    if (!first || !second) return null;
    const avatar = first.querySelector('.guild-composer-row-avatar');
    if (!avatar) return null;
    const pad = Number.parseFloat(getComputedStyle(first).paddingTop);
    const railTop = Number.parseFloat(getComputedStyle(first, '::after').top);
    const avatarHeight = avatar.getBoundingClientRect().height;
    return {
      secondPad: Number.parseFloat(getComputedStyle(second).paddingTop),
      expectedSecondPad: 0.42 * font,
      railGap: railTop - pad - avatarHeight,
      expectedRailGap: 0.2 * font,
    };
  });
  expect(continuation).not.toBeNull();
  expect(
    Math.abs(continuation!.secondPad - continuation!.expectedSecondPad)
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(continuation!.railGap - continuation!.expectedRailGap)
  ).toBeLessThanOrEqual(0.5);
});

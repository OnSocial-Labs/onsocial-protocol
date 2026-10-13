import { expect, test } from '@playwright/test';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';

const ACCOUNT = e2ePortfolioAccountId();
const writingPath = `/@${ACCOUNT}/writing`;

/**
 * Same reader the feed uses. More by stays in that frame, and back
 * walks to the article that was opened, then to the list behind it.
 */
test.describe('article reader back', () => {
  test('keeps the reader size and steps back to the list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, writingPath);
    await waitForPortfolioClientReady(page);
    await dismissNextDevOverlay(page);

    await page.getByRole('link', { name: 'Night drive' }).click();
    const night = page.getByRole('dialog', { name: 'Night drive' });
    await expect(night).toBeVisible();
    const opened = await night.boundingBox();
    expect(opened).not.toBeNull();

    const nextCard = night.getByRole('link', { name: 'Quiet print' });
    const cardBefore = await nextCard.boundingBox();
    expect(cardBefore).not.toBeNull();
    await page.mouse.move(
      cardBefore!.x + cardBefore!.width / 2,
      cardBefore!.y + cardBefore!.height / 2
    );
    await page.mouse.down();
    const pressed = await nextCard.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        transform: style.transform,
        background: style.backgroundColor,
        width: box.width,
        height: box.height,
      };
    });
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(pressed.transform);
    expect(pressed.width).toBe(cardBefore!.width);
    expect(pressed.height).toBe(cardBefore!.height);
    expect(pressed.background).not.toBe('rgba(0, 0, 0, 0)');
    await page.mouse.up();

    const quiet = page.getByRole('dialog', { name: 'Quiet print' });
    await expect(quiet).toBeVisible();
    const flipped = await quiet.boundingBox();
    expect(flipped?.width).toBe(opened?.width);
    expect(flipped?.height).toBe(opened?.height);
    await expect(page).toHaveURL(new RegExp(`${writingPath}/?$`));

    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Night drive' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(page.getByRole('dialog', { name: 'Night drive' })).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Night drive' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${writingPath}/?$`));
  });

  test('keeps the essay place and reveals more in the reader', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphWriting(page, 'reader');
    await gotoApp(page, `${writingPath}/night`);
    await dismissNextDevOverlay(page);

    const night = page.locator('.portfolio-writing-article-title', {
      hasText: 'Night drive',
    });
    await expect(night).toBeVisible();
    const scroller = page.locator('main.os-app-screen-body');
    const place = await scroller.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      return node.scrollTop;
    });
    expect(place).toBeGreaterThan(200);

    await page.getByRole('link', { name: 'Quiet print' }).click();
    await expect(
      page.locator('.portfolio-writing-article-title', {
        hasText: 'Quiet print',
      })
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${writingPath}/night/?$`));
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollTop))
      .toBeLessThan(8);

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(night).toBeVisible();
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(place - 8);

    await expect(page.getByRole('link', { name: 'Paper boats' })).toHaveCount(
      0
    );
    await page.getByRole('button', { name: 'More by Alice' }).click();
    await expect(page.getByRole('link', { name: 'Paper boats' })).toBeVisible();
    await expect(night).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${writingPath}/night/?$`));

    await page.getByRole('link', { name: 'Paper boats' }).click();
    await expect(
      page.locator('.portfolio-writing-article-title', {
        hasText: 'Paper boats',
      })
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(night).toBeVisible();
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(place - 8);
  });
});

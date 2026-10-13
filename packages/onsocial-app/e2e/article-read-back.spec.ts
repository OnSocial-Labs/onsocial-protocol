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
    await nextCard.dispatchEvent('pointerdown');
    const cardDown = await nextCard.boundingBox();
    expect(cardDown?.width).toBe(cardBefore?.width);
    expect(cardDown?.height).toBe(cardBefore?.height);
    await nextCard.dispatchEvent('pointerup');
    await nextCard.click();

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
});

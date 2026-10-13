import { expect, test } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  gotoApp,
  waitForPortfolioClientReady,
} from './helpers';

const ACCOUNT = e2ePortfolioAccountId();
const writingPath = `/@${ACCOUNT}/writing`;

test.describe('Writing shelf pen', () => {
  test('opens article compose for the owner', async ({ page }) => {
    await seedE2eWallet(page, ACCOUNT);
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, writingPath);
    await waitForPortfolioClientReady(page);
    await dismissNextDevOverlay(page);

    await page.getByRole('button', { name: 'Write an article' }).click();
    await expect(page.getByRole('dialog', { name: 'New article' })).toBeVisible();
  });

  test('hides the pen for a visitor', async ({ page }) => {
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, writingPath);
    await waitForPortfolioClientReady(page);
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('link', { name: 'Night drive' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Write an article' })
    ).toHaveCount(0);
  });
});

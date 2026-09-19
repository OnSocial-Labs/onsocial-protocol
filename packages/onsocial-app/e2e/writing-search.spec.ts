import { expect, test } from '@playwright/test';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  gotoApp,
  searchField,
  waitForPortfolioClientReady,
} from './helpers';

const ACCOUNT = e2ePortfolioAccountId();
const writingPath = `/@${ACCOUNT}/writing`;

test.describe('Writing shelf search', () => {
  test('keeps fast typing live and filters the article list', async ({
    page,
  }) => {
    await setE2eGraphWriting(page, 'shelf');
    await gotoApp(page, writingPath);
    await dismissNextDevOverlay(page);
    await waitForPortfolioClientReady(page);

    const field = searchField(page, 'Search writing');
    await expect(field).toBeVisible({ timeout: 30_000 });
    await expect(field).toHaveAttribute('type', 'text');
    await expect(page.getByRole('link', { name: 'Night drive' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: 'Quiet print' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Tokyo lights' })
    ).toBeVisible();
    await expect(page.locator('.portfolio-writing-chrome-kicker')).toHaveText(
      '3 articles'
    );

    await field.click();
    await field.pressSequentially('lisbon', { delay: 20 });
    await expect(field).toHaveValue('lisbon');
    await expect(page.getByRole('link', { name: 'Night drive' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quiet print' })).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Tokyo lights' })).toHaveCount(
      0
    );
    await expect(page.locator('.portfolio-writing-chrome-kicker')).toHaveText(
      '1 article'
    );

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(field).toHaveValue('');
    await expect(page.getByRole('link', { name: 'Quiet print' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Tokyo lights' })
    ).toBeVisible();
    await expect(page.locator('.portfolio-writing-chrome-kicker')).toHaveText(
      '3 articles'
    );
  });
});

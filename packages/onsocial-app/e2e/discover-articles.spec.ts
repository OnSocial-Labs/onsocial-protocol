import { expect, test } from '@playwright/test';
import { setE2eGraphArticles } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  gotoApp,
  typeDiscoverPeopleSearch,
} from './helpers';

/**
 * Discover search keeps the article list, and the reader sits on top of it.
 * Back returns to that list, then to the search.
 */
test.describe('discover articles', () => {
  test('opens an essay over the search and the rest of the list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphArticles(page, 'list');
    await gotoApp(page, '/discover');
    await dismissNextDevOverlay(page);
    await typeDiscoverPeopleSearch(page, 'night');

    const results = page.getByRole('region', { name: 'Search results' });
    const night = results.getByRole('link', { name: 'Night drive' });
    await expect(night).toBeVisible();
    await expect(night.locator('.profile-avatar__initial')).toHaveText('A');
    await expect(night).toContainText('by Alice · @alice.testnet');
    await expect(
      results.getByRole('link', { name: 'Harbor light' })
    ).toHaveCount(0);

    await night.click();
    await expect(
      page.getByRole('dialog', { name: 'Night drive' })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/discover\/?(\?|$)/);
    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(page.getByRole('dialog', { name: 'Night drive' })).toHaveCount(
      0
    );
    await expect(night).toBeVisible();

    await page.getByRole('button', { name: 'More articles' }).click();
    const list = page.getByRole('dialog', { name: 'Articles' });
    await expect(list).toBeVisible();
    const harbor = list.getByRole('link', { name: 'Harbor light' });
    await expect(harbor).toBeVisible();
    await expect(harbor.locator('.profile-avatar__initial')).toHaveText('A');
    await expect(harbor).toContainText('by Alice · @alice.testnet');
    await expect(page).toHaveURL(/\/discover\/?(\?|$)/);

    await harbor.click();
    await expect(
      page.getByRole('dialog', { name: 'Harbor light' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: 'Back' }).click();
    await expect(list).toHaveCount(0);
    await expect(night).toBeVisible();
    await expect(page).toHaveURL(/\/discover\/?(\?|$)/);
  });
});

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

    const discoverSearch = page.getByRole('textbox', {
      name: 'Search people, articles, books, music, and events',
    });
    const previewTitle = results.locator('.market-listing-title', {
      hasText: 'Night drive',
    });
    const discoverSearchBox = await discoverSearch.boundingBox();
    const previewTitleBox = await previewTitle.boundingBox();

    await page.getByRole('button', { name: 'More articles' }).click();
    const list = page.getByRole('dialog', { name: 'Articles' });
    await expect(list).toBeVisible();
    await expect(list.locator('.os-app-screen-subtitle')).toHaveCount(0);
    await expect(list.locator('h1')).toHaveText('Articles');
    const articlesSearch = list.getByRole('textbox', {
      name: 'Search articles',
    });
    await expect(articlesSearch).toHaveValue('night');
    const back = list.getByRole('button', { name: 'Back' });
    const backBox = await back.boundingBox();
    const articlesSearchBox = await articlesSearch.boundingBox();
    expect(backBox).not.toBeNull();
    expect(articlesSearchBox).not.toBeNull();
    expect(discoverSearchBox).not.toBeNull();
    const backMid = backBox!.y + backBox!.height / 2;
    const searchMid = articlesSearchBox!.y + articlesSearchBox!.height / 2;
    expect(Math.abs(backMid - searchMid)).toBeLessThan(2);
    const articlesRight = articlesSearchBox!.x + articlesSearchBox!.width;
    const discoverRight = discoverSearchBox!.x + discoverSearchBox!.width;
    expect(Math.abs(articlesRight - discoverRight)).toBeLessThan(2);

    const harbor = list.getByRole('link', { name: 'Harbor light' });
    await expect(harbor).toBeVisible();
    await expect(harbor.locator('.profile-avatar__initial')).toHaveText('A');
    await expect(harbor).toContainText('by Alice · @alice.testnet');
    const listTitle = list.locator('.market-listing-title', {
      hasText: 'Night drive',
    });
    const listTitleBox = await listTitle.boundingBox();
    expect(previewTitleBox).not.toBeNull();
    expect(listTitleBox).not.toBeNull();
    expect(Math.abs(listTitleBox!.x - previewTitleBox!.x)).toBeLessThan(2);
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

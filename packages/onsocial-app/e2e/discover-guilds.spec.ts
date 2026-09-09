import { expect, test } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  expectOsChromeWhisperRetry,
  gotoApp,
  searchField,
} from './helpers';
import {
  DISCOVER_GUILDS_E2E_PATH,
  DISCOVER_GUILDS_FIRST_NAME,
  DISCOVER_GUILDS_LOAD_MORE_ERROR,
  DISCOVER_GUILDS_NEXT_NAME,
  DISCOVER_GUILDS_SEARCH_ERROR,
  DISCOVER_GUILDS_SEARCH_HIT,
  DISCOVER_GUILDS_SEARCH_QUERY,
  stubDiscoverGuildsBrowse,
} from './helpers/discover-guilds';

test.describe('discover guilds', () => {
  test('load-more failure keeps the list and Retry fetches the next page', async ({
    page,
  }) => {
    await stubDiscoverGuildsBrowse(page);
    await gotoApp(page, DISCOVER_GUILDS_E2E_PATH);

    const firstGuild = page.getByRole('link', {
      name: DISCOVER_GUILDS_FIRST_NAME,
      exact: true,
    });
    const nextGuild = page.getByRole('link', {
      name: DISCOVER_GUILDS_NEXT_NAME,
      exact: true,
    });
    await expect(firstGuild).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page
      .getByRole('link', { name: 'Catalog Guild 24', exact: true })
      .scrollIntoViewIfNeeded();

    const loadMoreError = page.getByRole('alert').filter({
      hasText: DISCOVER_GUILDS_LOAD_MORE_ERROR,
    });
    await expect(loadMoreError).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(firstGuild).toBeVisible();
    await expect(nextGuild).toHaveCount(0);

    const retry = loadMoreError.getByRole('button', { name: 'Try again' });
    await expectOsChromeWhisperRetry(retry);
    await retry.click();
    await expect(nextGuild).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(loadMoreError).toHaveCount(0);
  });

  test('search failure keeps the catalog and Retry fetches matches', async ({
    page,
  }) => {
    await stubDiscoverGuildsBrowse(page, {
      failMoreOnce: false,
      failSearchOnce: true,
    });
    await gotoApp(page, DISCOVER_GUILDS_E2E_PATH);

    await expect(
      page.getByRole('link', {
        name: DISCOVER_GUILDS_FIRST_NAME,
        exact: true,
      })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    await searchField(page, 'Search Guilds').fill(DISCOVER_GUILDS_SEARCH_QUERY);

    const searchError = page.getByRole('alert').filter({
      hasText: DISCOVER_GUILDS_SEARCH_ERROR,
    });
    await expect(searchError).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(page.getByText('No matches.')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: DISCOVER_GUILDS_SEARCH_HIT, exact: true })
    ).toHaveCount(0);

    await searchError.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('link', { name: DISCOVER_GUILDS_SEARCH_HIT, exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(searchError).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import {
  DISCOVER_GUILDS_E2E_PATH,
  DISCOVER_GUILDS_FIRST_NAME,
  DISCOVER_GUILDS_LOAD_MORE_ERROR,
  DISCOVER_GUILDS_NEXT_NAME,
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

    await loadMoreError.getByRole('button', { name: 'Try again' }).click();
    await expect(nextGuild).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(loadMoreError).toHaveCount(0);
  });
});

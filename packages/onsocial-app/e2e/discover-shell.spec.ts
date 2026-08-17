import { test } from '@playwright/test';
import {
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
} from './helpers';

/**
 * Smoke for Discover shell — omni search + primary tabs.
 * Does not assert live profile/topic rows.
 */
test.describe('discover shell', () => {
  test('loads search and Discover tabs', async ({ page }) => {
    await gotoApp(page, '/discover');

    await expectSearchVisible(
      page,
      'Search people, topics, and tickers'
    );

    await expectTabVisible(page, 'Discover', 'Trending');
    await expectTabVisible(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Discover', 'Topics');
    await expectTabVisible(page, 'Discover', 'Tickers');
    await expectTabSelected(page, 'Discover', 'Trending');
  });

  test('deep-links Profiles from ?tab=profiles', async ({ page }) => {
    await gotoApp(page, '/discover?tab=profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
  });

  test('deep-links Topics from ?tab=topics', async ({ page }) => {
    await gotoApp(page, '/discover?tab=topics');
    await expectTabSelected(page, 'Discover', 'Topics');
  });
});

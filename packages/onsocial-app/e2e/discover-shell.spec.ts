import { expect, test } from '@playwright/test';
import {
  clickTab,
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
  searchField,
} from './helpers';

/**
 * Smoke for Discover shell — omni search + purpose-shaped tabs.
 * Does not assert live profile/topic rows.
 */
test.describe('discover shell', () => {
  test('loads search and Discover tabs', async ({ page }) => {
    await gotoApp(page, '/discover');

    await expectSearchVisible(page, 'Search people, topics, and tickers');

    await expectTabVisible(page, 'Discover', 'Moving');
    await expectTabVisible(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Discover', 'DAOs');
    await expectTabVisible(page, 'Discover', 'Guilds');
    await expectTabVisible(page, 'Discover', 'Hubs');
    await expectTabVisible(page, 'Discover', 'Topics');
    await expectTabVisible(page, 'Discover', 'Tickers');
    await expectTabSelected(page, 'Discover', 'Moving');
  });

  test('deep-links Profiles from ?tab=profiles', async ({ page }) => {
    await gotoApp(page, '/discover?tab=profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Filter profiles', 'All');
    await expectTabVisible(page, 'Filter profiles', 'People');
    await expectTabVisible(page, 'Filter profiles', 'Orgs');
    await expectTabVisible(page, 'Filter profiles', 'Hiring');
  });

  test('deep-links Topics from ?tab=topics', async ({ page }) => {
    await gotoApp(page, '/discover?tab=topics');
    await expectTabSelected(page, 'Discover', 'Topics');
  });

  test('routes a people search from Moving to Profiles', async ({ page }) => {
    await gotoApp(page, '/discover');
    await expectTabSelected(page, 'Discover', 'Moving');
    await searchField(page, 'Search people, topics, and tickers').fill('alice');
    await expectTabSelected(page, 'Discover', 'Profiles');
  });

  test('keeps face chips off the Moving landing', async ({ page }) => {
    await gotoApp(page, '/discover');
    await expectTabSelected(page, 'Discover', 'Moving');
    await expect(
      page.getByRole('tablist', { name: 'Filter profiles' })
    ).toHaveCount(0);
    await clickTab(page, 'Discover', 'Profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
    await expectTabVisible(page, 'Filter profiles', 'Hiring');
  });
});

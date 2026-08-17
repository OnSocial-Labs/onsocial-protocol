import { expect, test } from '@playwright/test';
import {
  clickTab,
  clickTabAndWaitUrl,
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
} from './helpers';

/**
 * Smoke for Drops discovery chrome — sort / medium rails, formats, deep-links.
 * Does not assert live indexer row content (network-dependent).
 */
test.describe('drops discovery', () => {
  test('loads catalog chrome and switches sort + medium', async ({ page }) => {
    await gotoApp(page, '/drops');

    await expectSearchVisible(page, 'Search drops');

    await expectTabVisible(page, 'Drop sort', 'Live');
    await expectTabVisible(page, 'Drop sort', 'Upcoming');

    await clickTabAndWaitUrl(page, 'Drop sort', 'Upcoming', /sort=upcoming/);
    await expectTabSelected(page, 'Drop sort', 'Upcoming');

    await expectTabVisible(page, 'Drop medium', 'Audio');
    await expectTabVisible(page, 'Drop medium', 'Tickets');

    await clickTabAndWaitUrl(page, 'Drop medium', 'Audio', /kind=audio/);
    await expectTabVisible(page, 'Release format', 'Album');
    await expectTabVisible(page, 'Release format', 'Podcast');

    await clickTabAndWaitUrl(
      page,
      'Release format',
      'Album',
      /audioFormat=album/
    );
    await expectTabSelected(page, 'Release format', 'Album');
  });

  test('deep-links sort and medium from the URL', async ({ page }) => {
    await gotoApp(page, '/drops?sort=closing&kind=ticket');
    await expectTabSelected(page, 'Drop sort', 'Closing');
    await expectTabSelected(page, 'Drop medium', 'Tickets');
  });

  test('deep-links audio format under Audio medium', async ({ page }) => {
    await gotoApp(page, '/drops?kind=audio&audioFormat=podcast');
    await expectTabSelected(page, 'Drop medium', 'Audio');
    await expectTabSelected(page, 'Release format', 'Podcast');
  });

  test('flip-back keeps catalog chrome without blanking search', async ({
    page,
  }) => {
    await gotoApp(page, '/drops');
    await expectTabVisible(page, 'Drop sort', 'Live');

    await clickTab(page, 'Drop sort', 'New');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sort'))
      .toBe('new');
    await clickTab(page, 'Drop sort', 'Live');
    // Default Live omits `sort` — poll URL (no nav if already clean).
    await expect
      .poll(() => new URL(page.url()).searchParams.has('sort'))
      .toBe(false);

    await expectSearchVisible(page, 'Search drops');
    await expectTabSelected(page, 'Drop sort', 'Live');
  });
});

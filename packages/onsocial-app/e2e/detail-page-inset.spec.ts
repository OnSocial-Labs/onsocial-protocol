import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, expectChromePageInset, gotoApp } from './helpers';
import {
  collectionPageRoot,
  expectCollectionPageSettled,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop, setE2eGraphGuild, setE2eGraphHub } from './helpers/e2e-graph';
import { GUILD_E2E_PATH, GUILD_E2E_TITLE, stubGuildPage } from './helpers/guild-page';
import { HUB_E2E_PATH, HUB_E2E_TITLE, stubHubPage } from './helpers/hub-page';

test.describe('detail page inset', () => {
  test.describe.configure({ mode: 'serial' });

  test('Guild page uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphGuild(page, 'empty');
    await stubGuildPage(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await expect(
      page.getByRole('heading', { name: GUILD_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.guilds-page'));
  });

  test('Hub page uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphHub(page, 'catalog');
    await stubHubPage(page, { rows: 'catalog' });
    await gotoApp(page, HUB_E2E_PATH);
    await expect(
      page.getByRole('heading', { name: HUB_E2E_TITLE }).first()
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.app-page'));
  });

  test('Drop page uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await expectCollectionPageSettled(page);
    await expectChromePageInset(collectionPageRoot(page));
  });
});

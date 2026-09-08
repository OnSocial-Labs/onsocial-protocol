import { expect, type Page } from '@playwright/test';
import {
  E2E_VAULT_OWNER,
  e2eVaultCollectionRows,
  e2eVaultListingRows,
  e2eVaultOwnedRows,
  type E2eGraphVault,
} from '../../src/lib/e2e-graph-stubs';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';
import {
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
} from './tabs';
import { marketFilterTrigger, openMarketFilter } from './market';

const VAULT_OWNER = E2E_VAULT_OWNER;

/**
 * Intercept browser GraphQL so the vault can render without a live API key.
 * Covers owned tokens, collection catalog, and one listed resale.
 */
async function stubVaultGraph(page: Page, vault: E2eGraphVault): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesOwnedBy')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesTokenOwners: e2eVaultOwnedRows(vault) },
        }),
      });
      return;
    }

    if (query.includes('ScarcesCollectionsCurrentByIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: e2eVaultCollectionRows(vault) },
        }),
      });
      return;
    }

    if (query.includes('ScarcesActiveListings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesActiveListings: e2eVaultListingRows(vault) },
        }),
      });
      return;
    }

    await route.continue();
  });
}

/**
 * Intercept browser GraphQL so the vault can render without a live API key.
 * Covers owned tokens, collection catalog, and one listed resale.
 */
export async function stubCollectiblesVaultGraph(page: Page): Promise<void> {
  await stubVaultGraph(page, 'default');
}

/** Six creators so the vault jump rail appears. */
export async function stubCollectiblesVaultManyCreators(
  page: Page
): Promise<void> {
  await stubVaultGraph(page, 'many-creators');
}

export const COLLECTIBLES_VAULT_OWNER = VAULT_OWNER;

export function collectiblesReadyRail(page: Page) {
  return page.locator('[data-collectibles-ready]');
}

export async function expectCollectiblesChrome(page: Page): Promise<void> {
  await expectSearchVisible(page, 'Search collectibles');
  await expect(collectiblesReadyRail(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(collectiblesReadyRail(page)).toHaveCount(1);
  await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
  await expectTabVisible(page, 'Collectible kind', 'All');
  await expect(
    collectiblesReadyRail(page).getByRole('tab', { name: 'Memberships' })
  ).toHaveCount(0);
  await expect(
    collectiblesReadyRail(page).getByRole('tab', { name: 'All' })
  ).toBeEnabled({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(marketFilterTrigger(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

/** Click a kind chip on the ready rail — retries until the URL matches. */
export async function clickCollectiblesKindAndWaitUrl(
  page: Page,
  name: string,
  kind: string | null
): Promise<void> {
  const chip = collectiblesReadyRail(page).getByRole('tab', { name });
  await expect(async () => {
    await chip.click();
    expect(new URL(page.url()).searchParams.get('kind')).toBe(kind);
  }).toPass({ timeout: E2E_CHROME_TIMEOUT_MS });
  if (kind == null) {
    await expectTabSelected(page, 'Collectible kind', 'All');
    return;
  }
  await expectTabSelected(page, 'Collectible kind', name);
}

/** Kind not on the held rail — pick it from Filter so the URL still updates. */
export async function pickCollectiblesKindFromFilter(
  page: Page,
  name: string,
  kind: string
): Promise<void> {
  await openMarketFilter(page);
  await page
    .getByRole('listbox', { name: 'Medium' })
    .getByRole('option', { name })
    .click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL((url) => url.searchParams.get('kind') === kind, {
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

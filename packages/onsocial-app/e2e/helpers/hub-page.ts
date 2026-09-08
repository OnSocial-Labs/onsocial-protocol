import type { Page } from '@playwright/test';
import {
  E2E_HUB_CREATOR_B,
  E2E_HUB_ID,
  E2E_HUB_OWNER,
  E2E_HUB_TITLE,
  e2eHubAppRow,
  e2eHubCatalogRows,
  e2eHubHeldCollectionRows,
  e2eHubOwnedRows,
  e2eHubStatsRow,
  type E2eGraphHub,
} from '../../src/lib/e2e-graph-stubs';

export const HUB_E2E_ID = E2E_HUB_ID;
export const HUB_E2E_TITLE = E2E_HUB_TITLE;
export const HUB_E2E_OWNER = E2E_HUB_OWNER;
export const HUB_E2E_PATH = `/apps/${encodeURIComponent(HUB_E2E_ID)}`;
export const HUB_E2E_CREATOR_B = E2E_HUB_CREATOR_B;

function hubFixture(opts?: {
  rows?: 'catalog' | 'empty';
  held?: boolean;
  ownerId?: string;
}): E2eGraphHub {
  if (opts?.held) return 'held';
  if (opts?.ownerId) return 'staff';
  return opts?.rows === 'catalog' ? 'catalog' : 'empty';
}

/** Browser GraphQL for hub catalog settle. Pair with `setE2eGraphHub` for SSR. */
export async function stubHubPage(
  page: Page,
  opts?: {
    rows?: 'catalog' | 'empty';
    catalogDelayMs?: number;
    /** Also stub owned tokens that match the hub catalog. */
    held?: boolean;
    /** Indexer owner — staff chrome when this is the seeded wallet. */
    ownerId?: string;
  }
): Promise<void> {
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const held = opts?.held === true;
  const hub = hubFixture(opts);
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesOwnedBy') && (held || opts?.ownerId)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesTokenOwners: e2eHubOwnedRows(hub) },
        }),
      });
      return;
    }

    if (held && query.includes('ScarcesCollectionsCurrentByIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: e2eHubHeldCollectionRows() },
        }),
      });
      return;
    }

    if (query.includes('ScarcesAppRow')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesApps: [e2eHubAppRow(hub)] },
        }),
      });
      return;
    }

    if (query.includes('ScarcesAppStats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesAppStats: [e2eHubStatsRow()] } }),
      });
      return;
    }

    if (
      query.includes('ScarcesCollectionsCurrent') &&
      !query.includes('ScarcesCollectionsCurrentByIds')
    ) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: e2eHubCatalogRows(hub) },
        }),
      });
      return;
    }

    await route.continue();
  });
}

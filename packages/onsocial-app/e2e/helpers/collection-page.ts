import { expect, type Page } from '@playwright/test';
import {
  E2E_VAULT_OWNER,
  e2eDropCollectionRow,
  type E2eDropCollectionId,
} from '../../src/lib/e2e-graph-stubs';
import { e2ePaintAccountId } from './e2e-signers';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';

/** Keep in sync with `src/lib/e2e-wallet-account.ts`. */
const E2E_WALLET_ACCOUNT_KEY = 'onsocial.e2e.accountId';

export const COLLECTION_E2E_VIEWER = E2E_VAULT_OWNER;

export type StubCollectionId = E2eDropCollectionId;

/**
 * Browser GraphQL for drop-page settle. Pair with `setE2eGraphDrop` for SSR.
 * Omit the cookie for the SSR-miss skeleton test.
 */
export async function stubCollectionPageGraph(
  page: Page,
  opts?: {
    heldIds?: readonly StubCollectionId[];
    /** Force sold-out / closed so holder chrome can hide the mint meter. */
    endedIds?: readonly StubCollectionId[];
    /** Hold ScarcesCollectionCurrent so the SSR-miss skeleton can be asserted. */
    catalogDelayMs?: number;
  }
): Promise<void> {
  const held = new Set(opts?.heldIds ?? []);
  const ended = new Set(opts?.endedIds ?? []);
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    let variables: Record<string, unknown> = {};
    try {
      const body = JSON.parse(raw) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      query = String(body.query ?? '');
      variables = body.variables ?? {};
    } catch {
      query = raw;
    }

    if (
      query.includes('ScarcesCollectionCurrent') &&
      !query.includes('ScarcesCollectionsCurrent')
    ) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      const id = String(variables.collectionId ?? '') as StubCollectionId;
      const known =
        id === 'night-drive' ||
        id === 'chapter-one' ||
        id === 'quiet-print' ||
        id === 'gate-pass';
      const row = known
        ? e2eDropCollectionRow(id, { ended: ended.has(id) })
        : null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: row ? [row] : [] },
        }),
      });
      return;
    }

    if (query.includes('OwnsCollectionEdition')) {
      const id = String(variables.collectionId ?? '') as StubCollectionId;
      const tokenId = held.has(id) ? `${id}:3` : null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesTokenOwners: tokenId ? [{ tokenId }] : [],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesEvents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesEvents: [] } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

/** Seed a connected account without NearConnector (dev / Playwright only). */
export async function seedE2eWallet(
  page: Page,
  accountId = e2ePaintAccountId(COLLECTION_E2E_VIEWER)
): Promise<void> {
  await page.addInitScript(
    ([key, account]) => {
      window.localStorage.setItem(key, account);
    },
    [E2E_WALLET_ACCOUNT_KEY, accountId] as const
  );
}

export function collectionPageRoot(page: Page) {
  return page.locator('.collection-page');
}

export async function expectCollectionVisitorChrome(page: Page): Promise<void> {
  const root = collectionPageRoot(page);
  await expect(root).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(root).not.toHaveClass(/is-use-first/);
  await expect(root).not.toHaveAttribute('data-collection-use-first', '');
  await expect(root).toHaveAttribute('data-collection-back', '/market');
  await expect(root.locator('.collection-commerce-supply')).toBeVisible();
  await expect(root.locator('.collection-product-price')).toContainText('NEAR');
  await expect(root.locator('.collection-progress')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Collectibles' })
  ).toHaveCount(0);
}

export async function expectCollectionHolderChrome(
  page: Page,
  backHref: string,
  opts?: { hideCommerce?: boolean }
): Promise<void> {
  const root = collectionPageRoot(page);
  await expect(root).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(root).toHaveClass(/is-use-first/);
  await expect(root).toHaveAttribute('data-collection-use-first', '');
  await expect(root).toHaveAttribute('data-collection-back', backHref);
  await expect(
    page.getByRole('link', { name: 'Open Collectibles' })
  ).toBeVisible();
  if (opts?.hideCommerce !== false) {
    await expect(root.locator('.collection-product-price')).toHaveCount(0);
    await expect(root.locator('.collection-progress')).toHaveCount(0);
  }
}

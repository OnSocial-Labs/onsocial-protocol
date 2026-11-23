import { expect, type Locator, type Page } from '@playwright/test';
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
type CollectionChassisProbe = {
  armed: boolean;
  first: number | null;
  last: number | null;
  chassisShift: number;
  cls: number;
};

/** Watch commerce-band top through creator / fans / guest tally settle. */
export async function armCollectionChassisProbe(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    const probe = {
      armed: false,
      first: null,
      last: null,
      chassisShift: 0,
      cls: 0,
    };
    window.__collectionChassisProbe = probe;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          const value = entry.value || 0;
          probe.cls += value;
          for (const source of entry.sources || []) {
            const node = source.node;
            if (
              node instanceof Element &&
              node.closest(
                '.collection-commerce-actions, .collection-product-row, .collection-guest-tally, .drops-discovery-by'
              )
            ) {
              probe.chassisShift += value;
            }
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (error) {}
    const mark = () => {
      const el = document.querySelector(
        '.collection-page:not(.collection-page--skeleton) .collection-commerce-actions'
      );
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) return;
      if (probe.first == null) probe.first = rect.top;
      probe.last = rect.top;
    };
    const arm = () => {
      if (!document.documentElement) return false;
      mark();
      if (probe.armed) return true;
      probe.armed = true;
      new MutationObserver(mark).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      const loop = () => {
        mark();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return true;
    };
    const wait = () => {
      if (!arm()) setTimeout(wait, 0);
    };
    wait();
  })();`);
}

export async function readCollectionChassisProbe(
  page: Page
): Promise<CollectionChassisProbe> {
  return page.evaluate(() => {
    const probe = (
      window as unknown as { __collectionChassisProbe?: CollectionChassisProbe }
    ).__collectionChassisProbe;
    return (
      probe ?? {
        armed: false,
        first: null,
        last: null,
        chassisShift: 0,
        cls: 1,
      }
    );
  });
}

export async function expectCollectionChassisStable(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  const probe = await readCollectionChassisProbe(page);
  expect(probe.armed).toBe(true);
  expect(probe.first).not.toBeNull();
  expect(probe.last).not.toBeNull();
  expect(Math.abs((probe.first ?? 0) - (probe.last ?? 0))).toBeLessThan(0.75);
  expect(probe.chassisShift).toBeLessThan(0.01);
  expect(probe.cls).toBeLessThan(0.05);
}

export async function stubCollectionPageGraph(
  page: Page,
  opts?: {
    heldIds?: readonly StubCollectionId[];
    /** Force sold-out / closed so holder chrome can hide the mint meter. */
    endedIds?: readonly StubCollectionId[];
    /** Hold ScarcesCollectionCurrent so the SSR-miss skeleton can be asserted. */
    catalogDelayMs?: number;
    profileDelayMs?: number;
    fansDelayMs?: number;
  }
): Promise<void> {
  const held = new Set(opts?.heldIds ?? []);
  const ended = new Set(opts?.endedIds ?? []);
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const profileDelayMs = opts?.profileDelayMs ?? 0;
  const fansDelayMs = opts?.fansDelayMs ?? 0;
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

    if (
      query.includes('Profiles(') ||
      (query.includes('profilesCurrent') && query.includes('Profiles'))
    ) {
      if (profileDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, profileDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            profilesCurrent: [
              {
                accountId: 'alice.near',
                field: 'name',
                value: 'Alice',
                blockHeight: 1,
                blockTimestamp: 1,
                operation: 'set',
              },
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ProfileStatsBatch')) {
      if (profileDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, profileDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            profileSearch: [
              { accountId: 'alice.near', name: 'Alice', avatar: null },
            ],
            profileKinds: [],
            reputationScores: [],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarceDropLoveCount')) {
      if (fansDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fansDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reactionCounts: [
              {
                postPath: `scarce/${String(variables.collectionId ?? 'quiet-print')}`,
                reactionCount: 5,
              },
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarceDropFanCount')) {
      if (fansDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fansDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarceDropLoveFans: [{ fanCount: 2 }] },
        }),
      });
      return;
    }

    if (query.includes('ScarceDropFanAccounts')) {
      if (fansDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fansDelayMs));
      }
      const collectionId = String(variables.collectionId ?? 'quiet-print');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reactionsCurrent: [
              { accountId: 'maya.near', path: `/scarce/${collectionId}` },
              { accountId: 'alex.near', path: `/scarce/${collectionId}` },
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ViewerScarceDropLove')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { reactionsCurrent: [] } }),
      });
      return;
    }

    if (query.includes('EventHolders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesTokenOwners: [
              { ownerId: 'maya.near' },
              { ownerId: 'alex.near' },
            ],
          },
        }),
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

/**
 * Route `loading.tsx` owns the SSR skeleton; the panel paints after hydrate
 * (and in the drop overlay). Expect one node.
 */
export function collectionPageSkeleton(page: Page): Locator {
  return page.locator('[data-collection-page-skeleton]');
}

/** Settled drop shell — excludes loading.tsx / SSR-miss skeletons. */
export function collectionPageRoot(page: Page): Locator {
  return page.locator('.collection-page:not(.collection-page--skeleton)');
}

export async function expectCollectionPageSettled(page: Page): Promise<void> {
  await expect(collectionPageSkeleton(page)).toHaveCount(0, {
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(collectionPageRoot(page)).toHaveCount(1);
}

export async function expectCollectionVisitorChrome(page: Page): Promise<void> {
  const root = collectionPageRoot(page);
  await expect(root).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(root).not.toHaveClass(/is-use-first/);
  await expect(root).not.toHaveAttribute('data-collection-use-first', '');
  await expect(root).toHaveAttribute('data-collection-back', '/drops');
  await expect(root.locator('.collection-commerce-supply')).toBeVisible();
  await expect(root.locator('.collection-product-price')).toContainText('NEAR');
  await expect(root.locator('.collection-progress')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Collectibles' })
  ).toHaveCount(0);
}

export async function expectCollectionHolderChrome(
  page: Page,
  backHref: string
): Promise<void> {
  const root = collectionPageRoot(page);
  await expect(root).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(root).toHaveClass(/is-use-first/);
  await expect(root).toHaveAttribute('data-collection-use-first', '');
  await expect(root).toHaveAttribute('data-collection-back', backHref);
  await expect(
    page.getByRole('link', { name: 'Open Collectibles' })
  ).toBeVisible();
  // Supply + progress always seat — ownership must not collapse the meter.
  await expect(root.locator('.collection-commerce-supply')).toBeVisible();
  await expect(root.locator('.collection-progress')).toBeVisible();
}

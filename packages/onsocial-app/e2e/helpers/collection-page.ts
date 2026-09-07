import { expect, type Page } from '@playwright/test';
import { e2ePaintAccountId } from './e2e-signers';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';

/** Keep in sync with `src/lib/e2e-wallet-account.ts`. */
const E2E_WALLET_ACCOUNT_KEY = 'onsocial.e2e.accountId';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

export const COLLECTION_E2E_VIEWER = 'greenghost.onsocial.testnet';

type CollectionStubKind = 'audio' | 'writing' | 'art' | 'ticket';

function extraForKind(kind: CollectionStubKind): Record<string, unknown> {
  if (kind === 'audio') {
    return {
      kind: 'audio',
      audioFormat: 'album',
      playable: [
        { cid: 'bafytrackoneaaaaaaaaaaaaaaaaaaaa', mime: 'audio/mpeg', title: 'One' },
        { cid: 'bafytracktwoaaaaaaaaaaaaaaaaaaaa', mime: 'audio/mpeg', title: 'Two' },
      ],
    };
  }
  if (kind === 'writing') {
    return {
      kind: 'writing',
      writingFormat: 'issue',
      readable: [
        {
          cid: 'bafymd1aaaaaaaaaaaaaaaaaaaaaaaa',
          mime: 'text/markdown',
          title: 'Chapter',
        },
      ],
    };
  }
  if (kind === 'ticket') {
    return { kind: 'ticket' };
  }
  return { kind: 'art' };
}

function collectionRow(opts: {
  collectionId: string;
  title: string;
  kind: CollectionStubKind;
  ended?: boolean;
}) {
  const extra = extraForKind(opts.kind);
  return {
    collectionId: opts.collectionId,
    creatorId: 'alice.near',
    appId: null,
    price: TWO_NEAR_YOCTO,
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: opts.ended ? 0 : 8,
    startTime: null,
    endTime: opts.ended ? Date.now() - 60_000 : null,
    createdAt: Date.now() - 86_400_000,
    mintMode: null,
    maxPerWallet: null,
    paused: false,
    cancelled: false,
    banned: false,
    transferable: true,
    renewable: false,
    maxRedeems: opts.kind === 'ticket' ? 1 : null,
    randomAssignment: false,
    appCommissionBps: null,
    title: opts.title,
    media: null,
    description: null,
    kind: opts.kind,
    mediumKind: opts.kind,
    sourcePostPath: null,
    metadataTemplate: JSON.stringify({
      title: opts.title,
      extra: JSON.stringify(extra),
    }),
    metadata: null,
    extraJson: JSON.stringify(extra),
    royaltyJson: null,
    createdBlockHeight: 1,
    createdBlockTimestamp: 1,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: 1,
  };
}

const STUBS = {
  'night-drive': collectionRow({
    collectionId: 'night-drive',
    title: 'Night Drive',
    kind: 'audio',
  }),
  'chapter-one': collectionRow({
    collectionId: 'chapter-one',
    title: 'Chapter One',
    kind: 'writing',
  }),
  'quiet-print': collectionRow({
    collectionId: 'quiet-print',
    title: 'Quiet Print',
    kind: 'art',
    ended: true,
  }),
  'gate-pass': collectionRow({
    collectionId: 'gate-pass',
    title: 'Gate Pass',
    kind: 'ticket',
    ended: true,
  }),
} as const;

export type StubCollectionId = keyof typeof STUBS;

/**
 * Browser GraphQL for drop-page client refresh (SSR still misses in this env).
 * Optional owned ids paint use-first after the e2e wallet seed.
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

    if (query.includes('ScarcesCollectionCurrent')) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      const id = String(variables.collectionId ?? '') as StubCollectionId;
      const base = STUBS[id] ?? null;
      const row = base
        ? ended.has(id)
          ? {
              ...base,
              remaining: 0,
              endTime: Date.now() - 60_000,
            }
          : base
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

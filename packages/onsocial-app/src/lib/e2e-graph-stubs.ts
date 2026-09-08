/**
 * Playwright GraphQL fixtures. Real production deploys never set
 * `E2E_GRAPH_STUBS`, so cookie-selected stubs stay inert there.
 * CI / local e2e set the flag at process start (not `NEXT_PUBLIC_`).
 *
 * Tests opt in with cookie `onsocial.e2e.graph` (e.g. `catalog=night-roads`).
 * No cookie → live indexer / existing `page.route` only (SSR miss still works).
 */

export const E2E_GRAPH_COOKIE = 'onsocial.e2e.graph';

export type E2eGraphCatalog = 'night-roads' | 'empty';

const TWO_NEAR_YOCTO = '2000000000000000000000000';
const NIGHT_ROADS = { id: 'night-roads', title: 'Night Roads' };
const FIXTURE_CREATED_AT = 1_700_000_000_000;
const FIXTURE_ENDED_AT = 1_699_913_600_000;

export function e2eGraphStubsAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.E2E_GRAPH_STUBS === '1'
  );
}

export function parseE2eGraphCookie(value: string | null | undefined): {
  catalog?: E2eGraphCatalog;
} {
  if (!value?.trim()) return {};
  const params = new URLSearchParams(value.replace(/;/g, '&'));
  const catalog = params.get('catalog');
  if (catalog === 'night-roads' || catalog === 'empty') {
    return { catalog };
  }
  return {};
}

export function isCreatorCatalogQuery(query: string): boolean {
  return (
    query.includes('ScarcesCollectionsCurrent') &&
    !query.includes('ScarcesCollectionsCurrentByIds')
  );
}

export function extractGraphQuery(body: unknown): string {
  if (typeof body !== 'string' || !body.trim()) return '';
  try {
    return String((JSON.parse(body) as { query?: string }).query ?? '');
  } catch {
    return body;
  }
}

export function isGraphQueryRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.includes('/graph/query')) return false;
  const method = (
    init?.method ??
    (typeof input !== 'string' && !(input instanceof URL)
      ? input.method
      : 'POST')
  ).toUpperCase();
  return method === 'POST';
}

function collectionRow(opts: {
  collectionId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  series?: { id: string; title: string };
  endTime?: number | null;
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: 'alice.near',
    appId: null,
    price: TWO_NEAR_YOCTO,
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: opts.endTime ?? null,
    createdAt: FIXTURE_CREATED_AT,
    mintMode: null,
    maxPerWallet: null,
    paused: false,
    cancelled: false,
    banned: false,
    transferable: true,
    renewable: false,
    maxRedeems: null,
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
      extra: JSON.stringify({ kind: opts.kind, ...opts.extra }),
    }),
    metadata: opts.series ? JSON.stringify({ series: opts.series }) : null,
    extraJson: JSON.stringify({
      kind: opts.kind,
      ...opts.extra,
      ...(opts.series ? { series: opts.series } : {}),
    }),
    royaltyJson: null,
    createdBlockHeight: 1,
    createdBlockTimestamp: 1,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: 1,
  };
}

/** Creator catalog rows for `ScarcesCollectionsCurrent` (not ByIds). */
export function e2eSeriesCatalogRows(
  catalog: E2eGraphCatalog
): ReturnType<typeof collectionRow>[] {
  if (catalog === 'empty') return [];
  return [
    collectionRow({
      collectionId: 'night-drive',
      title: 'Night Drive',
      kind: 'audio',
      extra: { audioFormat: 'album' },
      series: NIGHT_ROADS,
    }),
    collectionRow({
      collectionId: 'quiet-print',
      title: 'Quiet Print',
      kind: 'art',
      series: NIGHT_ROADS,
      endTime: FIXTURE_ENDED_AT,
    }),
  ];
}

export function resolveE2eGraphStub(opts: {
  query: string;
  cookieValue?: string | null;
}): { data: { scarcesCollectionsCurrent: unknown[] } } | null {
  const { catalog } = parseE2eGraphCookie(opts.cookieValue);
  if (!catalog) return null;
  if (!isCreatorCatalogQuery(opts.query)) return null;
  return {
    data: { scarcesCollectionsCurrent: e2eSeriesCatalogRows(catalog) },
  };
}

import { SCARCES_EVENT_TYPES } from '@onsocial/sdk';
import type { EventWindow } from '@/features/events/events-catalog';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export type EventGuestKind = 'going' | 'in' | 'attended';

const PAGE_SIZE = 80;
const MAX_PAGES = 5;

export function eventGuestKind(window: EventWindow): EventGuestKind {
  if (window === 'now') return 'in';
  if (window === 'past') return 'attended';
  return 'going';
}

/**
 * Row count. Upcoming may show passes minted until holders resolve.
 * A resolved roster wins, including zero. On now keeps a live zero.
 */
export function resolveEventGuestCount(
  kind: EventGuestKind,
  opts: { mintedCount: number; roster: string[] | undefined }
): number | null {
  if (opts.roster !== undefined) return opts.roster.length;
  if (kind === 'going' && opts.mintedCount > 0) return opts.mintedCount;
  return null;
}

/** Row count. On now keeps a live zero; the other windows stay quiet at zero. */
export function showEventGuestCount(
  kind: EventGuestKind,
  count: number | null
): count is number {
  if (count == null || count < 0) return false;
  if (kind === 'in') return true;
  return count > 0;
}

export function eventGuestCountLabel(
  kind: EventGuestKind,
  count: number
): string {
  const n = Math.max(0, Math.floor(count));
  if (kind === 'in') return n === 1 ? '1 in' : `${n} in`;
  if (kind === 'attended') {
    return n === 1 ? '1 attended' : `${n} attended`;
  }
  return n === 1 ? '1 going' : `${n} going`;
}

export function eventGuestSheetCopy(kind: EventGuestKind): {
  label: string;
  countSingular: string;
  countPlural: string;
  emptyCopy: string;
  errorCopy: string;
  closeAriaLabel: string;
  backdropLabel: string;
} {
  if (kind === 'in') {
    return {
      label: 'In',
      countSingular: 'in',
      countPlural: 'in',
      emptyCopy: 'No one is in yet.',
      errorCopy: 'Couldn’t load who’s in.',
      closeAriaLabel: 'Close who’s in',
      backdropLabel: 'Close who’s in',
    };
  }
  if (kind === 'attended') {
    return {
      label: 'Attended',
      countSingular: 'attended',
      countPlural: 'attended',
      emptyCopy: 'No one attended.',
      errorCopy: 'Couldn’t load who attended.',
      closeAriaLabel: 'Close who attended',
      backdropLabel: 'Close who attended',
    };
  }
  return {
    label: 'Going',
    countSingular: 'going',
    countPlural: 'going',
    emptyCopy: 'No one is going yet.',
    errorCopy: 'Couldn’t load who’s going.',
    closeAriaLabel: 'Close who’s going',
    backdropLabel: 'Close who’s going',
  };
}

export function eventGuestCountAria(
  kind: EventGuestKind,
  label: string
): string {
  if (kind === 'in') return `See who’s in, ${label}`;
  if (kind === 'attended') return `See who attended, ${label}`;
  return `See who’s going, ${label}`;
}

/** First-seen order, blank ids dropped. */
export function uniqueAccountIds(
  ids: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw?.trim() ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function pageAccountIds(
  loadPage: (offset: number) => Promise<Array<string | null | undefined>>
): Promise<string[]> {
  const ids: Array<string | null | undefined> = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await loadPage(page * PAGE_SIZE);
    ids.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return uniqueAccountIds(ids);
}

const HELD_PAGE_SIZE = 80;
/**
 * Pages read in one pass. A short page ends the vault. A full page at this
 * cap is incomplete — the caller can continue from `nextPage`.
 */
const HELD_MAX_PAGES = 8;

export type HeldCollectionPage = {
  ids: readonly (string | null | undefined)[];
  /** Raw rows, including blanks. A short page is the end of the vault. */
  fetched: number;
};

export type HeldCollections = {
  ids: Set<string>;
  /** False when the safety cap stopped on a full page. */
  complete: boolean;
  nextPage: number;
};

/**
 * Distinct collections the account still holds. Pages until a short page, or
 * `maxPages`. Duplicate token rows collapse into the set.
 */
export async function collectHeldCollectionIds(
  loadPage: (offset: number, limit: number) => Promise<HeldCollectionPage>,
  opts?: {
    pageSize?: number;
    maxPages?: number;
    startPage?: number;
    into?: Set<string>;
  }
): Promise<HeldCollections> {
  const pageSize = opts?.pageSize ?? HELD_PAGE_SIZE;
  const maxPages = opts?.maxPages ?? HELD_MAX_PAGES;
  const startPage = Math.max(0, Math.floor(opts?.startPage ?? 0));
  const ids = opts?.into ?? new Set<string>();
  let page = startPage;
  for (; page < startPage + maxPages; page += 1) {
    const rows = await loadPage(page * pageSize, pageSize);
    for (const raw of rows.ids) {
      const id = raw?.trim();
      if (id) ids.add(id);
    }
    if (rows.fetched < pageSize) {
      return { ids, complete: true, nextPage: page + 1 };
    }
  }
  return { ids, complete: false, nextPage: page };
}

type HeldGraphql = (req: {
  query: string;
  variables: Record<string, unknown>;
}) => Promise<{
  data?: {
    scarcesTokenOwners?: Array<{ collectionId?: string | null }>;
  } | null;
}>;

function heldCollectionsQuery(distinct: boolean): string {
  const order = distinct
    ? 'distinctOn: collectionId, orderBy: [{ collectionId: ASC }]'
    : 'orderBy: [{ updatedBlockTimestamp: DESC }]';
  return `
    query HeldCollections($ownerId: String!, $limit: Int!, $offset: Int!) {
      scarcesTokenOwners(
        where: {
          ownerId: { _eq: $ownerId }
          burned: { _eq: false }
        }
        limit: $limit
        offset: $offset
        ${order}
      ) {
        collectionId
      }
    }
  `;
}

function distinctCollectionsUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'GraphQLValidationError') return true;
  return /distinct/i.test(error.message);
}

/** Collections whose pass the account still holds. Sold or burned passes are absent. */
export async function loadHeldCollectionIdsFrom(
  graphql: HeldGraphql,
  accountId: string,
  opts?: { startPage?: number; into?: Set<string> }
): Promise<HeldCollections> {
  const ownerId = accountId.trim();
  const ids = opts?.into ?? new Set<string>();
  if (!ownerId) return { ids, complete: true, nextPage: 0 };

  const run = (distinct: boolean) =>
    collectHeldCollectionIds(
      async (offset, limit) => {
        const res = await graphql({
          query: heldCollectionsQuery(distinct),
          variables: { ownerId, limit, offset },
        });
        const rows = res.data?.scarcesTokenOwners ?? [];
        return {
          ids: rows.map((row) => row.collectionId),
          fetched: rows.length,
        };
      },
      { startPage: opts?.startPage, into: ids }
    );

  try {
    return await run(true);
  } catch (error) {
    if (!distinctCollectionsUnsupported(error)) throw error;
    return run(false);
  }
}

/** Collections whose pass the account still holds. Sold or burned passes are absent. */
export async function loadHeldCollectionIds(
  accountId: string,
  opts?: { startPage?: number; into?: Set<string> }
): Promise<HeldCollections> {
  const client = createReadOnlyOnSocialClient();
  return loadHeldCollectionIdsFrom(
    (req) => client.query.graphql(req),
    accountId,
    opts
  );
}

/** People who still hold a pass. */
export async function loadEventHolderIds(
  collectionId: string
): Promise<string[]> {
  const id = collectionId.trim();
  if (!id) return [];
  const client = createReadOnlyOnSocialClient();
  return pageAccountIds(async (offset) => {
    const res = await client.query.graphql<{
      scarcesTokenOwners: Array<{ ownerId?: string | null }>;
    }>({
      query: `
        query EventHolders($collectionId: String!, $limit: Int!, $offset: Int!) {
          scarcesTokenOwners(
            where: {
              collectionId: { _eq: $collectionId }
              burned: { _eq: false }
            }
            limit: $limit
            offset: $offset
          ) {
            ownerId
          }
        }
      `,
      variables: { collectionId: id, limit: PAGE_SIZE, offset },
    });
    return (res.data?.scarcesTokenOwners ?? []).map((row) => row.ownerId);
  });
}

/** People who checked in. Staff stays on the door log. */
export async function loadEventCheckInIds(
  collectionId: string
): Promise<string[]> {
  const id = collectionId.trim();
  if (!id) return [];
  const client = createReadOnlyOnSocialClient();
  return pageAccountIds(async (offset) => {
    const rows = await client.query.scarces.events({
      eventType: SCARCES_EVENT_TYPES.SCARCE,
      operation: 'redeem',
      collectionId: id,
      limit: PAGE_SIZE,
      offset,
    });
    return rows.map((row) => row.ownerId);
  });
}

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

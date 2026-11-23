import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';

/** Drop schedule already loaded for Show pass — title, when, place. */
export type ShowPassScheduleAhead = {
  title: string;
  cover: string | null;
  eventEndsAtMs: number | null;
  when: string | null;
  place: string | null;
  kind: string | null;
};

export type ShowPassStatusAhead = {
  status: TicketTokenStatus | null;
  statusError: string | null;
};

export type ShowPassAhead = {
  schedule: ShowPassScheduleAhead | null;
  status: TicketTokenStatus | null;
  statusError: string | null;
};

/** Same band as collection-view-cache — warm recent holdings, not the whole vault. */
const MAX = 48;

const scheduleSettled = new Map<string, ShowPassScheduleAhead>();
const scheduleInflight = new Map<
  string,
  Promise<ShowPassScheduleAhead | null>
>();

const statusSettled = new Map<string, ShowPassStatusAhead>();
const statusInflight = new Map<string, Promise<ShowPassStatusAhead>>();

function rememberLru<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** Schedule already loaded for this drop, if the card finished early. */
export function peekShowPassSchedule(
  collectionId: string
): ShowPassScheduleAhead | null {
  const id = collectionId.trim();
  if (!id) return null;
  return scheduleSettled.get(id) ?? null;
}

/** Token status already loaded for this edition, if the card finished early. */
export function peekShowPassStatus(tokenId: string): ShowPassStatusAhead | null {
  const id = tokenId.trim();
  if (!id) return null;
  return statusSettled.get(id) ?? null;
}

/**
 * One schedule + status load per pass. A holding on screen and a tap share it.
 * Pass `revalidateStatus` on sheet open so a prior peek paints first, then
 * the live redeem/expiry view can update without blanking the line.
 */
export function prefetchShowPass(opts: {
  collectionId: string;
  tokenId: string;
  seedTitle?: string | null;
  seedCover?: string | null;
  revalidateStatus?: boolean;
}): Promise<ShowPassAhead> {
  const collectionId = opts.collectionId.trim();
  const tokenId = opts.tokenId.trim();
  if (!collectionId || !tokenId) {
    return Promise.resolve({
      schedule: null,
      status: null,
      statusError: 'Could not load this pass.',
    });
  }

  return Promise.all([
    loadSchedule(collectionId, opts.seedTitle ?? null, opts.seedCover ?? null),
    loadStatus(tokenId, Boolean(opts.revalidateStatus)),
  ]).then(([schedule, statusAhead]) => ({
    schedule,
    status: statusAhead.status,
    statusError: statusAhead.statusError,
  }));
}

/** Test helper — empty the ahead maps between cases. */
export function clearShowPassAhead(): void {
  scheduleSettled.clear();
  scheduleInflight.clear();
  statusSettled.clear();
  statusInflight.clear();
}

async function loadSchedule(
  collectionId: string,
  seedTitle: string | null,
  seedCover: string | null
): Promise<ShowPassScheduleAhead | null> {
  const done = scheduleSettled.get(collectionId);
  if (done) return done;
  const pending = scheduleInflight.get(collectionId);
  if (pending) return pending;

  const promise = fetchCollectionPreferIndexer(collectionId)
    .then((view) => {
      if (!view) return null;
      const facts = ticketEventScheduleFacts(view, Date.now());
      const ahead: ShowPassScheduleAhead = {
        title: view.title.trim() || seedTitle?.trim() || 'Pass',
        cover: view.mediaUrl ?? (seedCover?.trim() || null),
        eventEndsAtMs: view.eventEndsAtMs,
        when: facts.when,
        place: facts.place,
        kind: view.kind,
      };
      rememberLru(scheduleSettled, collectionId, ahead);
      return ahead;
    })
    .catch(() => null)
    .finally(() => {
      scheduleInflight.delete(collectionId);
    });
  scheduleInflight.set(collectionId, promise);
  return promise;
}

async function loadStatus(
  tokenId: string,
  revalidate: boolean
): Promise<ShowPassStatusAhead> {
  if (!revalidate) {
    const done = statusSettled.get(tokenId);
    if (done) return done;
  }
  const pending = statusInflight.get(tokenId);
  if (pending) return pending;

  const promise = fetchTicketTokenStatus(tokenId)
    .then((status) => {
      const ahead: ShowPassStatusAhead = {
        status,
        statusError: status ? null : 'Could not load this pass.',
      };
      rememberLru(statusSettled, tokenId, ahead);
      return ahead;
    })
    .catch(() => {
      const ahead: ShowPassStatusAhead = {
        status: null,
        statusError: 'Could not load this pass.',
      };
      rememberLru(statusSettled, tokenId, ahead);
      return ahead;
    })
    .finally(() => {
      statusInflight.delete(tokenId);
    });
  statusInflight.set(tokenId, promise);
  return promise;
}

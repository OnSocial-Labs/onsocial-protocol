// ---------------------------------------------------------------------------
// ScarcesSubscribeApi — polling subscriptions over `os.query.scarces.events`.
//
// Each subscriber runs an independent timer. We track the highest
// `blockHeight` seen so callers only get NEW rows on subsequent ticks.
// Calling the returned `Unsubscribe` is idempotent.
// ---------------------------------------------------------------------------

import type { QueryModule } from '../../query/index.js';
import type { ScarcesEventRow } from '../../query/scarces.js';

export type Unsubscribe = () => void;

export interface SubscriptionInfo {
  /** Tick number, starting at 0 for the seed call. */
  tick: number;
  /** Highest blockHeight seen across all ticks for this subscription. */
  cursor: number;
  /** True for the very first emission (the initial backfill). */
  initial: boolean;
}

export type SubscriptionHandler = (
  events: ScarcesEventRow[],
  info: SubscriptionInfo
) => void | Promise<void>;

export interface SubscribeOptions {
  /** Poll interval in ms. Default `5_000`. */
  intervalMs?: number;
  /** Max rows returned per tick. Default `25`. */
  limit?: number;
  /**
   * If true, the seed call (tick 0) emits the most recent `limit` rows
   * for backfill. If false, the seed call only sets the cursor and the
   * handler fires from tick 1 onward. Default `true`.
   */
  emitInitial?: boolean;
  /**
   * Custom error handler. Default: silently swallow (subscription keeps
   * polling). Pass to surface transient indexer errors.
   */
  onError?: (err: unknown, info: SubscriptionInfo) => void;
}

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_LIMIT = 25;

export class ScarcesSubscribeApi {
  constructor(private _q: QueryModule) {}

  /**
   * Stream new scarces events for an entire collection. Useful for live
   * collection pages (new mints, new listings, sales).
   *
   * ```ts
   * const stop = os.subscribe.scarces.byCollection('col-1', (events) => {
   *   events.forEach(e => prependToFeed(e));
   * });
   * ```
   */
  byCollection(
    collectionId: string,
    handler: SubscriptionHandler,
    opts: SubscribeOptions = {}
  ): Unsubscribe {
    return this._poll(handler, opts, (limit) =>
      this._q.scarces.events({ collectionId, limit })
    );
  }

  /**
   * Stream new events for a single token (transfers, listings, sales,
   * burns). Cheaper than `byCollection` for hot collectibles.
   */
  byToken(
    tokenId: string,
    handler: SubscriptionHandler,
    opts: SubscribeOptions = {}
  ): Unsubscribe {
    return this._poll(handler, opts, (limit) =>
      this._q.scarces.events({ tokenId, limit })
    );
  }

  /** Stream new events for any token owned by `accountId`. */
  byOwner(
    accountId: string,
    handler: SubscriptionHandler,
    opts: SubscribeOptions = {}
  ): Unsubscribe {
    return this._poll(handler, opts, (limit) =>
      this._q.scarces.events({ ownerId: accountId, limit })
    );
  }

  /** Stream new events authored by `accountId` (mints, listings, etc.). */
  byAuthor(
    accountId: string,
    handler: SubscriptionHandler,
    opts: SubscribeOptions = {}
  ): Unsubscribe {
    return this._poll(handler, opts, (limit) =>
      this._q.scarces.events({ author: accountId, limit })
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  private _poll(
    handler: SubscriptionHandler,
    opts: SubscribeOptions,
    fetchPage: (limit: number) => Promise<ScarcesEventRow[]>
  ): Unsubscribe {
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const emitInitial = opts.emitInitial ?? true;
    let cursor = 0;
    let tick = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tickOnce = async (initial: boolean): Promise<void> => {
      const info: SubscriptionInfo = { tick, cursor, initial };
      try {
        const rows = await fetchPage(limit);
        if (stopped) return;
        if (rows.length > 0) {
          const newCursor = Math.max(cursor, rows[0]!.blockHeight);
          // events() returns DESC by blockHeight — anything > previous
          // cursor is new. On the seed call we honor `emitInitial`.
          const fresh =
            initial && !emitInitial
              ? []
              : rows.filter((r) => r.blockHeight > cursor);
          cursor = newCursor;
          if (fresh.length > 0 || (initial && emitInitial)) {
            const toEmit = initial && emitInitial ? rows : fresh;
            await handler(toEmit, { ...info, cursor });
          }
        }
      } catch (err) {
        if (opts.onError) opts.onError(err, info);
      }
      tick += 1;
      if (!stopped) timer = setTimeout(() => void tickOnce(false), intervalMs);
    };

    void tickOnce(true);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    };
  }
}

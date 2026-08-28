import type { FeedSort, PostRow } from './_shared.js';
import type { Paginated } from './types.js';
import { postContentPath } from './threads.js';

const GROUP_POST_PATH = /^([^/]+)\/groups\/([^/]+)\/content\/post\/(.+)$/;
const PERSONAL_POST_PATH = /^([^/]+)\/post\/(.+)$/;

export type PulsePostRef = {
  accountId: string;
  postId: string;
  groupId?: string;
};

/** Parse a personal or group content path into account + post id. */
export function parsePostRefFromContentPath(path: string): PulsePostRef | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const group = GROUP_POST_PATH.exec(trimmed);
  if (group) {
    return {
      accountId: group[1]!,
      postId: group[3]!,
      groupId: group[2],
    };
  }
  const personal = PERSONAL_POST_PATH.exec(trimmed);
  if (!personal) return null;
  return { accountId: personal[1]!, postId: personal[2]! };
}

function parentAuthorOf(row: PostRow): string | null {
  if (!row.parentPath) return null;
  return row.parentAuthor || row.parentPath.split('/')[0] || null;
}

/** Conversation to card — indexed root, else immediate parent. */
export function pulseBridgeCardPath(row: PostRow): string | null {
  const root = row.rootPath?.trim();
  if (root) return root;
  return row.parentPath?.trim() || null;
}

export function isCircleNativePost(
  row: PostRow,
  accounts: ReadonlySet<string>
): boolean {
  const parentAuthor = parentAuthorOf(row);
  return parentAuthor === null || accounts.has(parentAuthor);
}

function postKey(row: PostRow): string {
  return `${row.accountId}\0${row.postId}`;
}

function rankHeat(row: PostRow): number {
  return row.amplifyHeat ?? 0;
}

function rankHeight(row: PostRow): number {
  return row.blockHeight ?? 0;
}

function comparePulseRank(
  a: { heat: number; height: number },
  b: { heat: number; height: number },
  sort: FeedSort
): number {
  if (sort === 'hot' && a.heat !== b.heat) return b.heat - a.heat;
  return b.height - a.height;
}

type PulseEvent = {
  heat: number;
  height: number;
  rows: PostRow[];
};

/**
 * Merge native circle rows with hydrated thread roots + one newest
 * circle reply per stranger conversation. `limit` / `offset` page events
 * (cards), not raw rows — a bridge event flattens to root + reply.
 */
export function assemblePulsePage(input: {
  native: readonly PostRow[];
  bridges: readonly PostRow[];
  parents: readonly PostRow[];
  accounts: readonly string[];
  sort: FeedSort;
  offset: number;
  limit: number;
  take: number;
}): Paginated<PostRow> {
  const accounts = new Set(input.accounts);
  const parentByPath = new Map<string, PostRow>();
  for (const parent of input.parents) {
    parentByPath.set(postContentPath(parent), parent);
  }

  const nativeEvents: PulseEvent[] = [];
  const nativeKeys = new Set<string>();
  const nativePaths = new Set<string>();
  for (const row of input.native) {
    if (!isCircleNativePost(row, accounts)) continue;
    nativeEvents.push({
      heat: rankHeat(row),
      height: rankHeight(row),
      rows: [row],
    });
    nativeKeys.add(postKey(row));
    nativePaths.add(postContentPath(row));
  }

  const bestBridge = new Map<string, PostRow>();
  for (const reply of input.bridges) {
    if (isCircleNativePost(reply, accounts)) continue;
    const cardPath = pulseBridgeCardPath(reply);
    if (!cardPath) continue;
    const existing = bestBridge.get(cardPath);
    if (
      !existing ||
      comparePulseRank(
        { heat: rankHeat(reply), height: rankHeight(reply) },
        { heat: rankHeat(existing), height: rankHeight(existing) },
        input.sort
      ) < 0
    ) {
      bestBridge.set(cardPath, reply);
    }
  }

  const bridgeEvents: PulseEvent[] = [];
  for (const [cardPath, reply] of bestBridge) {
    if (nativePaths.has(cardPath)) continue;
    const parent = parentByPath.get(cardPath);
    if (!parent || nativeKeys.has(postKey(parent))) continue;
    bridgeEvents.push({
      heat: rankHeat(reply),
      height: rankHeight(reply),
      rows: [parent, reply],
    });
  }

  const events = [...nativeEvents, ...bridgeEvents].sort((a, b) => {
    const byRank = comparePulseRank(a, b, input.sort);
    if (byRank !== 0) return byRank;
    const aKey = postKey(a.rows[0]!);
    const bKey = postKey(b.rows[0]!);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  const sliced = events.slice(input.offset, input.offset + input.limit);
  const nativeExhausted = input.native.length < input.take;
  const bridgesExhausted = input.bridges.length < input.take;
  const hasMore =
    events.length > input.offset + input.limit ||
    (sliced.length === input.limit && (!nativeExhausted || !bridgesExhausted));

  return {
    items: sliced.flatMap((event) => event.rows),
    nextOffset: hasMore ? input.offset + sliced.length : undefined,
  };
}

/** Native Circle row that `feed_pulse` emits as a one-row card. */
export function isPulseNativeCardRow(
  row: PostRow,
  accounts: ReadonlySet<string>
): boolean {
  return accounts.has(row.accountId) && isCircleNativePost(row, accounts);
}

/**
 * Split SQL `feed_pulse` rows into cards. Natives are one row; bridges are
 * `[strangerRoot, circlePeek]` in that order.
 */
export function splitPulseFunctionRows(
  rows: readonly PostRow[],
  accounts: readonly string[]
): PostRow[][] {
  const accountSet = new Set(accounts);
  const cards: PostRow[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (isPulseNativeCardRow(row, accountSet)) {
      cards.push([row]);
      continue;
    }
    if (!accountSet.has(row.accountId)) {
      const peek = rows[i + 1];
      const rootPath = postContentPath(row);
      if (peek && pulseBridgeCardPath(peek) === rootPath) {
        cards.push([row, peek]);
        i += 1;
      } else {
        cards.push([row]);
      }
      continue;
    }
    cards.push([row]);
  }
  return cards;
}

export function paginatePulseFunctionRows(input: {
  rows: readonly PostRow[];
  accounts: readonly string[];
  offset: number;
  limit: number;
}): Paginated<PostRow> {
  const cards = splitPulseFunctionRows(input.rows, input.accounts);
  const sliced = cards.slice(0, input.limit);
  return {
    items: sliced.flat(),
    nextOffset:
      cards.length > input.limit ? input.offset + sliced.length : undefined,
  };
}

/** Distinct parent refs that still need a `postsFeed` hydrate. */
export function pulseParentRefsToHydrate(
  bridges: readonly PostRow[],
  accounts: readonly string[]
): PulsePostRef[] {
  const accountSet = new Set(accounts);
  const seen = new Set<string>();
  const refs: PulsePostRef[] = [];
  for (const reply of bridges) {
    if (isCircleNativePost(reply, accountSet)) continue;
    const path = pulseBridgeCardPath(reply);
    if (!path || seen.has(path)) continue;
    const ref = parsePostRefFromContentPath(path);
    if (!ref) continue;
    seen.add(path);
    refs.push(ref);
  }
  return refs;
}

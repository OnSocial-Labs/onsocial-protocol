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

/**
 * Hasura tracks `feed_pulse(accounts text[])` as `_text`, not `[String!]!`.
 * Quote every id so dots in NEAR accounts stay one element.
 */
export function pulseAccountsTextArray(accounts: readonly string[]): string {
  return `{${accounts
    .map(
      (account) => `"${account.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    )
    .join(',')}}`;
}

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
  const nativeRoots: PostRow[] = [];
  const nativeReplies: PostRow[] = [];
  for (const row of input.native) {
    if (!isCircleNativePost(row, accounts)) continue;
    nativeKeys.add(postKey(row));
    nativePaths.add(postContentPath(row));
    if (parentAuthorOf(row)) nativeReplies.push(row);
    else nativeRoots.push(row);
  }

  const rootByPath = new Map(
    nativeRoots.map((root) => [postContentPath(root), root] as const)
  );
  for (const parent of input.parents) {
    const path = postContentPath(parent);
    if (!rootByPath.has(path)) rootByPath.set(path, parent);
  }
  const peekByRootKey = new Map<string, PostRow>();
  for (const reply of nativeReplies) {
    const cardPath = pulseBridgeCardPath(reply);
    const root = cardPath ? rootByPath.get(cardPath) : undefined;
    if (!root) continue;
    const rootKey = postKey(root);
    const existing = peekByRootKey.get(rootKey);
    if (
      !existing ||
      comparePulseRank(
        { heat: rankHeat(reply), height: rankHeight(reply) },
        { heat: rankHeat(existing), height: rankHeight(existing) },
        input.sort
      ) < 0
    ) {
      peekByRootKey.set(rootKey, reply);
    }
  }

  const attachedReplies = new Set<string>();
  const emittedRoots = new Set<string>();
  for (const root of nativeRoots) {
    const peek = peekByRootKey.get(postKey(root));
    if (peek) attachedReplies.add(postKey(peek));
    emittedRoots.add(postKey(root));
    nativeEvents.push({
      heat: peek ? rankHeat(peek) : rankHeat(root),
      height: peek ? rankHeight(peek) : rankHeight(root),
      rows: peek ? [root, peek] : [root],
    });
  }
  for (const parent of input.parents) {
    const key = postKey(parent);
    if (emittedRoots.has(key)) continue;
    const peek = peekByRootKey.get(key);
    if (!peek) continue;
    attachedReplies.add(postKey(peek));
    emittedRoots.add(key);
    nativeEvents.push({
      heat: rankHeat(peek),
      height: rankHeight(peek),
      rows: [parent, peek],
    });
  }
  for (const reply of nativeReplies) {
    if (attachedReplies.has(postKey(reply))) continue;
    nativeEvents.push({
      heat: rankHeat(reply),
      height: rankHeight(reply),
      rows: [reply],
    });
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
  // Folding replies onto roots shrinks the card list. Streams that still
  // have rows mean older unreplied posts were not in this take yet.
  const hasMore =
    events.length > input.offset + input.limit ||
    !nativeExhausted ||
    !bridgesExhausted;

  return {
    items: sliced.flatMap((event) => event.rows),
    nextOffset: hasMore ? input.offset + sliced.length : undefined,
  };
}

/** Native Circle row that `feed_pulse` emits as a card root. */
export function isPulseNativeCardRow(
  row: PostRow,
  accounts: ReadonlySet<string>
): boolean {
  return accounts.has(row.accountId) && isCircleNativePost(row, accounts);
}

function isNativeSelfPeek(
  root: PostRow,
  peek: PostRow | undefined,
  accounts: ReadonlySet<string>
): peek is PostRow {
  if (!peek || parentAuthorOf(root) || !isPulseNativeCardRow(peek, accounts)) {
    return false;
  }
  return pulseBridgeCardPath(peek) === postContentPath(root);
}

/**
 * Split SQL `feed_pulse` rows into cards. Native roots are one row, or
 * `[root, newestSelfReply]`. Bridges are `[strangerRoot, circlePeek]`.
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
      const peek = rows[i + 1];
      if (isNativeSelfPeek(row, peek, accountSet)) {
        cards.push([row, peek]);
        i += 1;
      } else {
        cards.push([row]);
      }
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

function rowMatchesContentPath(row: PostRow, path: string): boolean {
  if (postContentPath(row) === path) return true;
  const ref = parsePostRefFromContentPath(path);
  return Boolean(
    ref && row.accountId === ref.accountId && row.postId === ref.postId
  );
}

/** Root for a native self-reply, matched by path or account + post id. */
export function resolvePulseThreadRoot(
  reply: PostRow,
  pool: readonly PostRow[]
): PostRow | undefined {
  const path = pulseBridgeCardPath(reply);
  if (!path) return undefined;
  return pool.find(
    (row) => rowMatchesContentPath(row, path) && postKey(row) !== postKey(reply)
  );
}

/**
 * Old `feed_pulse` emits a self-reply as its own card. Pin the original
 * in front so Pulse opens on [root, reply], same as a live lift.
 */
export function attachPulseSelfReplyRoots(
  cards: readonly PostRow[][],
  extraParents: readonly PostRow[],
  accounts: readonly string[]
): PostRow[][] {
  const accountSet = new Set(accounts);
  const pool = [...extraParents, ...cards.flat()];
  const moved = new Set<string>();
  const out: PostRow[][] = [];

  for (const card of cards) {
    const only = card[0];
    if (
      card.length === 1 &&
      only &&
      isPulseNativeCardRow(only, accountSet) &&
      parentAuthorOf(only)
    ) {
      const root = resolvePulseThreadRoot(only, pool);
      if (root) {
        moved.add(postKey(root));
        out.push([root, only]);
        continue;
      }
    }
    if (card.some((row) => moved.has(postKey(row)))) continue;
    out.push(card);
  }
  return out;
}

export function paginatePulseFunctionRows(input: {
  rows: readonly PostRow[];
  accounts: readonly string[];
  offset: number;
  limit: number;
  extraParents?: readonly PostRow[];
}): Paginated<PostRow> {
  // SQL already applied cardOffset and asked for limit+1 cards. Join
  // originals onto replies after that — merged card count is not the
  // page window, or a first page of 24 events looks exhausted.
  const sqlCards = splitPulseFunctionRows(input.rows, input.accounts);
  const hasMore = sqlCards.length > input.limit;
  const cards = attachPulseSelfReplyRoots(
    sqlCards,
    input.extraParents ?? [],
    input.accounts
  );
  const sliced = cards.slice(0, input.limit);
  return {
    items: sliced.flat(),
    nextOffset: hasMore ? input.offset + input.limit : undefined,
  };
}

/**
 * Self-reply roots missing from this Pulse page — hydrate so open-feed
 * can show the original without waiting on a SQL deploy.
 */
export function pulseSelfReplyRootsToHydrate(
  rows: readonly PostRow[],
  accounts: readonly string[]
): PulsePostRef[] {
  const accountSet = new Set(accounts);
  const seen = new Set<string>();
  const refs: PulsePostRef[] = [];
  for (const row of rows) {
    if (!isPulseNativeCardRow(row, accountSet) || !parentAuthorOf(row)) {
      continue;
    }
    const path = pulseBridgeCardPath(row);
    if (!path || seen.has(path)) continue;
    if (resolvePulseThreadRoot(row, rows)) continue;
    const ref = parsePostRefFromContentPath(path);
    if (!ref) continue;
    seen.add(path);
    refs.push(ref);
  }
  return refs;
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

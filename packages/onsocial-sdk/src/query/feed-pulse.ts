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

/** Hottest amplify on the card, then the newest row. A cold reply must not hide a boost on the root. */
function rankOf(rows: readonly PostRow[]): { heat: number; height: number } {
  let heat = 0;
  let height = 0;
  for (const row of rows) {
    heat = Math.max(heat, rankHeat(row));
    height = Math.max(height, rankHeight(row));
  }
  return { heat, height };
}

function rankHeight(row: PostRow): number {
  return row.blockHeight ?? 0;
}

/**
 * Mirror `feed_pulse` event_height / event_heat / event_key for the next
 * card-keyset page. Bridge cards key off the circle peek; native cards use
 * GREATEST(root, peek) and the root path.
 */
export function pulseCardEventCursor(
  card: readonly PostRow[],
  accounts: ReadonlySet<string>
): { height: number; heat: number; key: string } | null {
  if (card.length === 0) return null;
  const first = card[0]!;
  const isBridge = !accounts.has(first.accountId);
  if (isBridge) {
    const reply = card[1] ?? first;
    return {
      height: rankHeight(reply),
      heat: rankHeat(reply),
      key: postContentPath(first),
    };
  }
  const peek = card[1];
  return {
    height: Math.max(rankHeight(first), peek ? rankHeight(peek) : 0),
    heat: Math.max(rankHeat(first), peek ? rankHeat(peek) : 0),
    key: postContentPath(first),
  };
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
  sort?: FeedSort;
}): Paginated<PostRow> {
  // SQL already applied cardOffset/keyset and asked for limit+1 cards. Join
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
  if (!hasMore) return { items: sliced.flat() };

  const accountSet = new Set(input.accounts);
  const lastCard = sliced[sliced.length - 1];
  const cursor = lastCard ? pulseCardEventCursor(lastCard, accountSet) : null;
  if (cursor) {
    return {
      items: sliced.flat(),
      nextBeforeBlockHeight: cursor.height,
      nextBeforeEventKey: cursor.key,
      ...(input.sort === 'hot' ? { nextBeforeHeat: cursor.heat } : {}),
    };
  }
  return {
    items: sliced.flat(),
    nextOffset: input.offset + input.limit,
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

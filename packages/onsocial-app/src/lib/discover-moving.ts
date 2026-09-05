import type {
  HashtagCount,
  PlaceCount,
  PostRow,
  ProfileSearchRow,
  TickerCount,
} from '@onsocial/sdk';
import { formatDiscoverTabCount } from '@/lib/discover-tab-lead';
import { appendThreadFocusReply, postThreadPath } from '@/lib/post-routes';

/** Any non-empty Moving peek — first paint can skip skeletons. */
export function isMovingLandingPainted(
  seed:
    | {
        movingTickers?: readonly unknown[] | null;
        movingTopics?: readonly unknown[] | null;
        places?: readonly unknown[] | null;
        profiles?: readonly unknown[] | null;
        hubs?: readonly unknown[] | null;
        posts?: readonly unknown[] | null;
        talkedAbout?: readonly unknown[] | null;
        justSold?: readonly unknown[] | null;
        proposals?: readonly unknown[] | null;
      }
    | null
    | undefined
): boolean {
  if (!seed) return false;
  return (
    (seed.movingTickers?.length ?? 0) > 0 ||
    (seed.movingTopics?.length ?? 0) > 0 ||
    (seed.places?.length ?? 0) > 0 ||
    (seed.profiles?.length ?? 0) > 0 ||
    (seed.hubs?.length ?? 0) > 0 ||
    (seed.posts?.length ?? 0) > 0 ||
    (seed.talkedAbout?.length ?? 0) > 0 ||
    (seed.justSold?.length ?? 0) > 0 ||
    (seed.proposals?.length ?? 0) > 0
  );
}

/** Empty SSR seed stays pending so Moving reserves skeletons instead of jumping in. */
export function movingSectionFromSeed<T>(
  rows: T[] | null | undefined,
  painted: boolean
): T[] | null {
  if (painted) return rows ?? [];
  if (Array.isArray(rows) && rows.length > 0) return rows;
  return null;
}

/** True when Home Hot would rank this post above a cold chrono fallback. */
export function postHasAmplifyHeat(
  post: Pick<PostRow, 'amplifyHeat'>
): boolean {
  return Number(post.amplifyHeat) > 0;
}

/** Keep only posts with real amplify heat. Cold / chrono fallback stays off Moving. */
export function selectHotPosts(items: PostRow[], limit = 6): PostRow[] {
  return items.filter(postHasAmplifyHeat).slice(0, limit);
}

/** Distinct authors in recency order — Moving Active is who just posted. */
export function recentPosterIds(
  items: Array<Pick<PostRow, 'accountId'>>,
  limit = 6,
  exclude?: Iterable<string>
): string[] {
  const skip = new Set(
    [...(exclude ?? [])].map((id) => id.trim()).filter(Boolean)
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of items) {
    const id = row.accountId.trim();
    if (!id || seen.has(id) || skip.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

/** First (newest) post time per author — Active face rows. */
export function firstPosterTimestamps(
  items: Array<Pick<PostRow, 'accountId' | 'blockTimestamp'>>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of items) {
    const id = row.accountId.trim();
    if (!id || out.has(id)) continue;
    const ts = Number(row.blockTimestamp) || 0;
    if (ts > 0) out.set(id, ts);
  }
  return out;
}

export type MovingActivePeek = {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  lastPostTimestamp: number | null;
};

/** Face peeks for Active — same people as recentPosterIds, with last-post time. */
export function movingActivePeeks(
  accounts: Array<{
    accountId: string;
    name?: string | null;
    avatarUrl?: string | null;
  }>,
  posts: Array<Pick<PostRow, 'accountId' | 'blockTimestamp'>>,
  limit = 6,
  exclude?: Iterable<string>
): MovingActivePeek[] {
  const times = firstPosterTimestamps(posts);
  const byId = new Map(
    accounts.map((row) => [row.accountId.trim(), row] as const)
  );
  const out: MovingActivePeek[] = [];
  for (const id of recentPosterIds(posts, limit, exclude)) {
    const account = byId.get(id);
    if (!account) continue;
    const lastPost = times.get(id);
    out.push({
      accountId: id,
      name: account.name?.trim() || null,
      avatarUrl: account.avatarUrl?.trim() || null,
      lastPostTimestamp:
        lastPost != null && Number.isFinite(lastPost) && lastPost > 0
          ? lastPost
          : null,
    });
  }
  return out;
}

/** Hubs already represented by a Just sold drop — one object per scan. */
export function excludeMovingHubsAlreadySold<
  T extends { appId: string; title?: string | null },
>(
  hubs: T[],
  sold: Array<{ appId?: string | null; title?: string | null }>
): T[] {
  const soldApps = new Set(
    sold
      .map((row) => row.appId?.trim())
      .filter((id): id is string => Boolean(id))
  );
  const soldTitles = new Set(
    sold
      .map((row) => row.title?.trim().toLowerCase())
      .filter((title): title is string => Boolean(title))
  );
  if (soldApps.size === 0 && soldTitles.size === 0) return hubs;
  return hubs.filter((hub) => {
    const appId = hub.appId.trim();
    const title = hub.title?.trim().toLowerCase() || '';
    if (appId && soldApps.has(appId)) return false;
    if (title && soldTitles.has(title)) return false;
    return true;
  });
}

export function orderRowsByAccountIds<T extends { accountId: string }>(
  rows: T[],
  ids: string[]
): T[] {
  const byId = new Map(rows.map((row) => [row.accountId, row]));
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

export function orderProfileSearchByPosterIds(
  rows: ProfileSearchRow[],
  ids: string[]
): ProfileSearchRow[] {
  return orderRowsByAccountIds(rows, ids);
}

export type MovingPostRef = { author: string; postId: string };

export function movingPostRefKey(ref: MovingPostRef): string {
  return `${ref.author}\0${ref.postId}`;
}

/** Parent thread of a reply (`parentAuthor` + last `/post/{id}` in the path). */
export function parentPostRefFromReply(
  reply: Pick<PostRow, 'parentAuthor' | 'parentPath'>
): MovingPostRef | null {
  const path = reply.parentPath?.trim() ?? '';
  const marker = '/post/';
  const index = path.lastIndexOf(marker);
  const postId = index >= 0 ? path.slice(index + marker.length).trim() : '';
  const author =
    reply.parentAuthor?.trim() ||
    (index > 0 ? path.slice(0, index).split('/')[0]?.trim() : '');
  if (!author || !postId) return null;
  return { author, postId };
}

/**
 * Distinct parent threads in reply order — used to open the thread
 * the reply just moved.
 */
export function talkedAboutParentRefs(
  replies: Array<Pick<PostRow, 'parentAuthor' | 'parentPath'>>,
  limit = 6
): MovingPostRef[] {
  const seen = new Set<string>();
  const out: MovingPostRef[] = [];
  for (const reply of replies) {
    const ref = parentPostRefFromReply(reply);
    if (!ref) continue;
    const key = movingPostRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * First reply per parent, newest conversation first — Moving Talked about
 * is the reply that just landed, not the parent thread.
 */
export function talkedAboutReplies(replies: PostRow[], limit = 6): PostRow[] {
  const seen = new Set<string>();
  const out: PostRow[] = [];
  for (const reply of replies) {
    const ref = parentPostRefFromReply(reply);
    if (!ref) continue;
    const key = movingPostRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reply);
    if (out.length >= limit) break;
  }
  return out;
}

/** Parent thread, scrolled to the reply that moved it. */
export function talkedAboutThreadHref(reply: PostRow): string {
  const ref = parentPostRefFromReply(reply);
  const thread = ref
    ? postThreadPath({
        accountId: ref.author,
        postId: ref.postId,
        groupId: reply.groupId,
      })
    : postThreadPath(reply);
  return appendThreadFocusReply(thread, reply.postId);
}

export type MovingMentionKind = 'topic' | 'ticker' | 'place';

export type MovingMention = {
  kind: MovingMentionKind;
  id: string;
  lastBlock: number;
  lastTimestamp: number;
};

/**
 * Last-mention mix — no lifetime counts. Topics, tickers, and places
 * share one rail on Moving. Prefer real mention time, then last block.
 */
export function mergeMovingMentions(
  topics: Array<Pick<HashtagCount, 'hashtag' | 'lastBlock' | 'lastTimestamp'>>,
  tickers: Array<Pick<TickerCount, 'ticker' | 'lastBlock' | 'lastTimestamp'>>,
  places: Array<Pick<PlaceCount, 'place' | 'lastBlock' | 'lastTimestamp'>>,
  limit = 6
): MovingMention[] {
  const rows: MovingMention[] = [
    ...topics.map((row) => ({
      kind: 'topic' as const,
      id: row.hashtag,
      lastBlock: Number(row.lastBlock) || 0,
      lastTimestamp: Number(row.lastTimestamp) || 0,
    })),
    ...tickers.map((row) => ({
      kind: 'ticker' as const,
      id: row.ticker,
      lastBlock: Number(row.lastBlock) || 0,
      lastTimestamp: Number(row.lastTimestamp) || 0,
    })),
    ...places.map((row) => ({
      kind: 'place' as const,
      id: row.place,
      lastBlock: Number(row.lastBlock) || 0,
      lastTimestamp: Number(row.lastTimestamp) || 0,
    })),
  ];
  rows.sort(
    (a, b) =>
      b.lastTimestamp - a.lastTimestamp ||
      b.lastBlock - a.lastBlock ||
      a.id.localeCompare(b.id)
  );
  return rows.slice(0, limit);
}

type MentionQuery<T> = {
  recentMentions: (opts?: { limit?: number }) => Promise<T[]>;
  trending: (opts?: {
    limit?: number;
    sort?: 'count' | 'recent';
  }) => Promise<T[]>;
};

async function mentionRowsOrRecent<T>(
  source: MentionQuery<T>,
  limit: number
): Promise<T[]> {
  try {
    const recent = await source.recentMentions({ limit });
    if (recent.length > 0) return recent;
  } catch {
    // Unfiltered junction orderBy can be denied; count view still works.
  }
  try {
    return await source.trending({ limit, sort: 'recent' });
  } catch {
    return [];
  }
}

/** Moving Mentioned: real times from stubs, last-block chips if that query is empty. */
export async function fetchMovingMentionRows(
  query: {
    hashtags: MentionQuery<HashtagCount>;
    tickers: MentionQuery<TickerCount>;
    places: MentionQuery<PlaceCount>;
  },
  limit = 6
): Promise<{
  topics: HashtagCount[];
  tickers: TickerCount[];
  places: PlaceCount[];
}> {
  const [topics, tickers, places] = await Promise.all([
    mentionRowsOrRecent(query.hashtags, limit),
    mentionRowsOrRecent(query.tickers, limit),
    mentionRowsOrRecent(query.places, limit),
  ]);
  return { topics, tickers, places };
}

export type JustSoldRef = {
  collectionId: string;
  appId: string | null;
  lastSaleTimestamp: number;
};

/** Drop id on the event, or inside extraData when the column is empty. */
export function collectionIdFromSaleEvent(sale: {
  collectionId?: string | null;
  extraData?: string | null;
}): string {
  const direct = sale.collectionId?.trim() ?? '';
  if (direct) return direct;
  const raw = sale.extraData?.trim() ?? '';
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as {
      collection_id?: unknown;
      collectionId?: unknown;
    };
    const extra =
      (typeof parsed.collection_id === 'string' && parsed.collection_id) ||
      (typeof parsed.collectionId === 'string' && parsed.collectionId) ||
      '';
    return extra.trim();
  } catch {
    return '';
  }
}

/**
 * First sale per drop, newest first — Moving Just sold is last sale,
 * not lifetime volume.
 */
export function justSoldCollectionRefs(
  sales: Array<{
    collectionId?: string | null;
    extraData?: string | null;
    appId?: string | null;
    blockTimestamp?: number | null;
  }>,
  limit = 6
): JustSoldRef[] {
  const seen = new Set<string>();
  const out: JustSoldRef[] = [];
  for (const row of sales) {
    const id = collectionIdFromSaleEvent(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      collectionId: id,
      appId: row.appId?.trim() || null,
      lastSaleTimestamp: Number(row.blockTimestamp) || 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function orderPostsByRefs(
  rows: PostRow[],
  refs: MovingPostRef[]
): PostRow[] {
  const byKey = new Map(
    rows.map((row) => [movingPostRefKey(rowToRef(row)), row])
  );
  const out: PostRow[] = [];
  for (const ref of refs) {
    const row = byKey.get(movingPostRefKey(ref));
    if (row) out.push(row);
  }
  return out;
}

function rowToRef(row: PostRow): MovingPostRef {
  return { author: row.accountId, postId: row.postId };
}

/** Compact count on Moving chips and drop signals. */
export function movingChipCountLabel(count: number): string {
  return formatDiscoverTabCount(count);
}

/** Drop peek meta — sold vs fans, omitted when the rank has no number. */
export function movingScarceSignalLabel(
  kind: 'traded' | 'loved',
  count: number | null | undefined
): string | null {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  const compact = formatDiscoverTabCount(n);
  if (kind === 'loved') return n === 1 ? '1 fan' : `${compact} fans`;
  return n === 1 ? '1 sold' : `${compact} sold`;
}

/** Quiet proposal status — no chain jargon. */
export function movingProposalStatusLabel(
  status: string | null | undefined
): string | null {
  const raw = status?.trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (key === 'inprogress' || key === 'active' || key === 'open') {
    return 'In review';
  }
  if (key === 'approved' || key === 'accepted' || key === 'executed') {
    return 'Approved';
  }
  if (key === 'rejected' || key === 'failed') return 'Rejected';
  if (key === 'expired') return 'Expired';
  return raw;
}

/** Proposal peek meta — status first, type only when status is empty. */
export function movingProposalMeta(row: {
  status?: string | null;
  proposalType?: string | null;
  groupId?: string | null;
}): string {
  return (
    movingProposalStatusLabel(row.status) ||
    row.proposalType?.trim() ||
    row.groupId?.trim() ||
    ''
  );
}

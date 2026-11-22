import {
  postContentPath,
  type OnSocial,
  type PostReactionState,
  type PostRow,
  type PostScarceEmbed,
  type ScarcesActiveListingRow,
  type ScarcesCollectionCurrentRow,
  type ThreadCounts,
} from '@onsocial/sdk';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { postScarceKey } from '@/features/scarces/scarce-embed-ledger';
import { yoctoToNear } from '@/lib/app-near-rpc';
import type { PostEngagementMap } from '@/lib/engagement-row-seed';
import {
  EMPTY_POST_ENGAGEMENT,
  type PostEngagement,
} from '@/lib/post-engagement-model';
import {
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostTokenEmbed,
  postKey,
} from '@/lib/post-display';
import { isRepostRefType } from '@/lib/post-relation';
import { publicCountsOnFeedRow } from '@/lib/prepare-feed-paint';

export type { PostEngagementMap } from '@/lib/engagement-row-seed';
export {
  engagementSeedFromFeedRows,
  fillEngagementSeedFromFeedRows,
} from '@/lib/engagement-row-seed';
export type PostScarceEmbedMap = Record<string, PostScarceEmbed>;

function priceNearFromYocto(
  raw: string | null | undefined
): string | undefined {
  if (!raw?.trim() || !/^\d+$/.test(raw.trim())) return undefined;
  return yoctoToNear(raw.trim());
}

function lazyEmbedFromActiveRow(
  row: ScarcesActiveListingRow
): PostScarceEmbed | null {
  if (row.kind !== 'lazy') return null;
  const listingId = row.listingId?.trim();
  if (!listingId) return null;
  const mediaUrl = resolveScarceMediaUrl(row.media ?? null) ?? undefined;
  const cardBg = row.cardBg?.trim() || undefined;
  const priceNear = priceNearFromYocto(row.price) ?? undefined;
  const usdE6 = row.usdE6?.trim() || undefined;
  const appId = row.appId?.trim() || undefined;
  const mediumKind = row.mediumKind?.trim().toLowerCase() || undefined;
  return {
    status: 'lazy_listing',
    listingId,
    ...(appId ? { appId } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...(priceNear ? { priceNear } : {}),
    ...(usdE6 ? { usdE6 } : {}),
    ...(typeof row.copies === 'number' ? { copies: row.copies } : {}),
    ...(typeof row.remaining === 'number' ? { remaining: row.remaining } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(cardBg ? { cardBg } : {}),
    events: [],
  };
}

function dropEmbedFromCollectionRow(
  row: ScarcesCollectionCurrentRow
): PostScarceEmbed | null {
  const collectionId = row.collectionId?.trim();
  if (!collectionId) return null;
  const remaining =
    typeof row.remaining === 'number' && Number.isFinite(row.remaining)
      ? Math.max(0, Math.floor(row.remaining))
      : undefined;
  const copies =
    typeof row.totalSupply === 'number' && Number.isFinite(row.totalSupply)
      ? Math.max(0, Math.floor(row.totalSupply))
      : undefined;
  const priceNear = priceNearFromYocto(row.price) ?? undefined;
  const usdE6 = row.usdE6?.trim() || undefined;
  const appId = row.appId?.trim() || undefined;
  const mediumKind =
    row.mediumKind?.trim().toLowerCase() ||
    (row.kind?.trim().toLowerCase() === 'music'
      ? 'audio'
      : row.kind?.trim().toLowerCase()) ||
    undefined;
  let seriesId: string | undefined;
  let seriesTitle: string | undefined;
  try {
    const meta = row.metadata ? JSON.parse(row.metadata) : null;
    const series =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).series
        : null;
    if (typeof series === 'string' && series.trim()) {
      seriesId = series.trim();
    } else if (series && typeof series === 'object' && !Array.isArray(series)) {
      const record = series as Record<string, unknown>;
      if (typeof record.id === 'string' && record.id.trim()) {
        seriesId = record.id.trim();
      }
      if (typeof record.title === 'string' && record.title.trim()) {
        seriesTitle = record.title.trim();
      }
    }
  } catch {
    /* ignore */
  }
  const status: PostScarceEmbed['status'] =
    remaining === 0 || row.cancelled || row.banned
      ? 'sold'
      : row.paused
        ? 'minted'
        : 'drop';
  const mediaUrl = resolveScarceMediaUrl(row.media ?? null) ?? undefined;
  const creatorId = row.creatorId?.trim() || undefined;
  return {
    status,
    collectionId,
    ...(creatorId ? { creatorId } : {}),
    ...(appId ? { appId } : {}),
    ...(seriesId ? { seriesId } : {}),
    ...(seriesTitle ? { seriesTitle } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...(priceNear ? { priceNear } : {}),
    ...(usdE6 ? { usdE6 } : {}),
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    events: [],
  };
}

function paintSnapshotToEmbed(
  snapshot: NonNullable<ReturnType<typeof parseDropPaintSnapshot>>,
  tokenId?: string
): PostScarceEmbed {
  const collectionId = snapshot.collectionId?.trim() || undefined;
  const resolvedTokenId = (tokenId || snapshot.tokenId)?.trim() || undefined;
  // Token-only paint (post-minted `s:` resale) — no Drop catalog baseline.
  if (!collectionId && resolvedTokenId) {
    return {
      status: 'listed',
      tokenId: resolvedTokenId,
      ...(snapshot.mediumKind ? { mediumKind: snapshot.mediumKind } : {}),
      ...(snapshot.mediaUrl
        ? {
            mediaUrl:
              resolveScarceMediaUrl(snapshot.mediaUrl) ?? snapshot.mediaUrl,
          }
        : {}),
      events: [],
    };
  }
  return {
    status: 'drop',
    ...(collectionId ? { collectionId } : {}),
    ...(resolvedTokenId ? { tokenId: resolvedTokenId } : {}),
    ...(snapshot.mediumKind ? { mediumKind: snapshot.mediumKind } : {}),
    ...(snapshot.mediaUrl
      ? {
          mediaUrl:
            resolveScarceMediaUrl(snapshot.mediaUrl) ?? snapshot.mediaUrl,
        }
      : {}),
    events: [],
  };
}

function applySellerListingToEmbed(
  embed: PostScarceEmbed,
  tokenId: string,
  listings: readonly ScarcesActiveListingRow[]
): PostScarceEmbed {
  let next: PostScarceEmbed = { ...embed, tokenId };
  const listed = listings.find(
    (entry) =>
      entry.tokenId?.trim() === tokenId &&
      (entry.kind === 'native' || entry.kind === 'auction')
  );
  if (listed?.kind === 'native' && listed.tokenId) {
    const priceNear = priceNearFromYocto(listed.price) ?? next.priceNear;
    const usdE6 = listed.usdE6?.trim() || next.usdE6;
    next = {
      ...next,
      status: 'listed',
      tokenId: listed.tokenId.trim(),
      ...(listed.listingId?.trim()
        ? { listingId: listed.listingId.trim() }
        : {}),
      ...(priceNear ? { priceNear } : {}),
      ...(usdE6 ? { usdE6 } : {}),
    };
  } else if (listed?.kind === 'auction' && listed.tokenId) {
    const priceNear =
      priceNearFromYocto(listed.highestBid ?? listed.reservePrice) ??
      next.priceNear;
    next = {
      ...next,
      status: 'auction',
      tokenId: listed.tokenId.trim(),
      ...(priceNear ? { priceNear } : {}),
    };
  }
  return next;
}

/**
 * Resolve durable `embeds[].kind === 'collection'` references via
 * `collectionsCurrentByIds`. Optional holder `tokenId` upgrades to Buy when
 * that edition is actively listed by the post author.
 */
export async function hydrateCollectionEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  if (posts.length === 0) return {};

  const refs: {
    key: string;
    collectionId: string;
    tokenId?: string;
    paint: ReturnType<typeof parseDropPaintSnapshot>;
    sellerId: string;
  }[] = [];

  for (const post of posts) {
    const parsed = parsePostCollectionEmbed(post.value);
    if (!parsed) continue;
    const paint = parseDropPaintSnapshot(post.value);
    refs.push({
      key: postScarceKey(post.accountId, post.postId),
      collectionId: parsed.collectionId,
      ...(parsed.tokenId ? { tokenId: parsed.tokenId } : {}),
      paint,
      sellerId: post.accountId,
    });
  }
  if (refs.length === 0) return {};

  const collectionIds = [
    ...new Set(refs.map((ref) => ref.collectionId).filter(Boolean)),
  ];
  let rows: ScarcesCollectionCurrentRow[] = [];
  try {
    rows = await os.query.scarces.collectionsCurrentByIds(collectionIds);
  } catch {
    rows = [];
  }
  const byCollectionId = new Map(
    rows.map((row) => [row.collectionId.trim(), row] as const)
  );

  const tokenIds = [
    ...new Set(
      refs
        .map((ref) => ref.tokenId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  // One batched query for every token-bearing ref on the page — a token has
  // at most one active native/auction listing, so limit matches exactly.
  const sellerListings =
    tokenIds.length === 0
      ? []
      : await os.query.scarces
          .activeListings({
            kinds: ['native', 'auction'],
            tokenIds,
            limit: tokenIds.length,
          })
          .catch(() => [] as ScarcesActiveListingRow[]);

  const out: PostScarceEmbedMap = {};
  for (const ref of refs) {
    const row = byCollectionId.get(ref.collectionId);
    let embed = row
      ? dropEmbedFromCollectionRow(row)
      : ref.paint
        ? paintSnapshotToEmbed(ref.paint, ref.tokenId)
        : null;
    if (!embed) continue;

    if (ref.tokenId) {
      embed = applySellerListingToEmbed(embed, ref.tokenId, sellerListings);
    }

    out[ref.key] = embed;
  }
  return out;
}

/**
 * Resolve durable `embeds[].kind === 'token'` (post-minted resale announce)
 * via the post author's active native/auction listings.
 */
export async function hydrateTokenEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  if (posts.length === 0) return {};

  const refs: {
    key: string;
    tokenId: string;
    paint: ReturnType<typeof parseDropPaintSnapshot>;
    sellerId: string;
  }[] = [];

  for (const post of posts) {
    const parsed = parsePostTokenEmbed(post.value);
    if (!parsed) continue;
    const paint = parseDropPaintSnapshot(post.value);
    refs.push({
      key: postScarceKey(post.accountId, post.postId),
      tokenId: parsed.tokenId,
      paint,
      sellerId: post.accountId,
    });
  }
  if (refs.length === 0) return {};

  const tokenIds = [...new Set(refs.map((ref) => ref.tokenId))];
  // Single batch: tokenId {_in} — one active listing per token at most.
  const listings = await os.query.scarces
    .activeListings({
      kinds: ['native', 'auction'],
      tokenIds,
      limit: tokenIds.length,
    })
    .catch(() => [] as ScarcesActiveListingRow[]);

  const out: PostScarceEmbedMap = {};
  for (const ref of refs) {
    const baseline = ref.paint
      ? paintSnapshotToEmbed(ref.paint, ref.tokenId)
      : {
          status: 'listed' as const,
          tokenId: ref.tokenId,
          events: [],
        };
    out[ref.key] = applySellerListingToEmbed(baseline, ref.tokenId, listings);
  }
  return out;
}

/** Merge fromPost/lazy hydrate with collection + token embeds (refs win). */
export async function hydrateScarceEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  const [fromPost, collectionRefs, tokenRefs] = await Promise.all([
    hydrateLazyScarceEmbedsForPosts(os, posts),
    hydrateCollectionEmbedsForPosts(os, posts),
    hydrateTokenEmbedsForPosts(os, posts),
  ]);
  return { ...fromPost, ...collectionRefs, ...tokenRefs };
}

/** Batched counts (+ optional viewer flags). Prefer row seed for publics first. */
export async function loadPostEngagementMap(
  os: OnSocial,
  posts: readonly PostRow[],
  opts?: { viewer?: string | null }
): Promise<PostEngagementMap> {
  if (posts.length === 0) return {};
  const viewer = opts?.viewer?.trim() || null;

  const targets = posts.map((post) => ({
    key: postKey(post),
    path: postContentPath(post),
    owner: post.accountId,
    postId: post.postId,
  }));

  // Repost rows render the original post's stats, so seed those too. The
  // original row isn't loaded server-side, but its owner/postId are encoded
  // in the shell's refPath (`owner/post/id` or `owner/groups/…/post/id`).
  const seenKeys = new Set(targets.map((t) => t.key));
  for (const post of posts) {
    if (!isRepostRefType(post.refType)) continue;
    const path = post.refPath?.trim();
    if (!path) continue;
    const segments = path.split('/');
    const owner = segments[0];
    const postId = segments[segments.length - 1];
    if (!owner || !postId || segments[segments.length - 2] !== 'post') {
      continue;
    }
    const key = `${owner}:${postId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    targets.push({ key, path, owner, postId });
  }
  const paths = targets.map((t) => t.path);

  const painted = new Map<
    string,
    {
      replyCount: number;
      quoteCount: number;
      repostCount: number;
      reactionCount: number;
      amplifyCount?: number;
    }
  >();
  for (const post of posts) {
    const own = publicCountsOnFeedRow(post);
    if (own) painted.set(postKey(post), own);
    const quoted =
      post.quotedPost && typeof post.quotedPost === 'object'
        ? post.quotedPost
        : null;
    const quotedCounts = publicCountsOnFeedRow(quoted);
    if (quoted && quotedCounts) painted.set(postKey(quoted), quotedCounts);
  }
  const missing = targets.filter((target) => !painted.has(target.key));
  const missingPaths = missing.map((target) => target.path);
  // Viewer needs reaction state for every row — public count rows skip the
  // count fetch, but still need like colour.
  const reactionTargets = viewer ? targets : missing;
  const amplifyCountMissing = targets.filter(
    (target) => painted.get(target.key)?.amplifyCount == null
  );
  const amplifyCountPaths = amplifyCountMissing.map((t) => t.path);
  const emptyThreadCounts: Record<string, ThreadCounts> = {};
  const emptyReactionStates: Record<string, PostReactionState> = {};
  const emptyAmplify: Record<
    string,
    { amplifyCount: number; viewerAmplified: boolean }
  > = {};
  const emptyViewerAmplify: Record<string, boolean> = {};

  const needFullAmplify = amplifyCountPaths.length > 0;
  const needViewerAmplifyOnly =
    Boolean(viewer) && !needFullAmplify && paths.length > 0;

  const [
    threadResult,
    reactionResult,
    amplifyResult,
    viewerAmplifyResult,
    savesResult,
    repostResult,
  ] = await Promise.allSettled([
    missing.length > 0
      ? os.query.threads.countsByPaths(missingPaths)
      : Promise.resolve(emptyThreadCounts),
    reactionTargets.length > 0
      ? os.query.reactions.statesForPosts(
          reactionTargets.map((target) => ({
            owner: target.owner,
            postId: target.postId,
          })),
          viewer ? { viewer } : {}
        )
      : Promise.resolve(emptyReactionStates),
    needFullAmplify
      ? os.query.socialSpend.amplifyCountsForPostPaths(
          amplifyCountPaths,
          viewer ? { viewer } : {}
        )
      : Promise.resolve(emptyAmplify),
    needViewerAmplifyOnly
      ? os.query.socialSpend.viewerAmplifiedForPostPaths(viewer!, paths)
      : Promise.resolve(emptyViewerAmplify),
    viewer ? os.query.saves.forPaths(viewer, paths) : Promise.resolve([]),
    viewer
      ? os.query.threads.viewerReposts(viewer, paths)
      : Promise.resolve([]),
  ]);

  const threadCounts: Record<string, ThreadCounts> =
    threadResult.status === 'fulfilled'
      ? threadResult.value
      : emptyThreadCounts;
  const reactionStates: Record<string, PostReactionState> =
    reactionResult.status === 'fulfilled'
      ? reactionResult.value
      : emptyReactionStates;
  const amplifyCounts =
    amplifyResult.status === 'fulfilled' ? amplifyResult.value : emptyAmplify;
  const viewerAmplifiedMap =
    viewerAmplifyResult.status === 'fulfilled'
      ? viewerAmplifyResult.value
      : emptyViewerAmplify;
  const savedPaths = new Set(
    (savesResult.status === 'fulfilled' ? savesResult.value : []).map(
      (row: { contentPath: string }) => row.contentPath
    )
  );
  const viewerReposts = new Map(
    (repostResult.status === 'fulfilled' ? repostResult.value : []).map(
      (row: {
        refPath: string;
        repostId?: string;
        groupId?: string | null;
      }) => [row.refPath, row]
    )
  );

  const threadsOk = threadResult.status === 'fulfilled';
  const reactionsOk = reactionResult.status === 'fulfilled';
  const next: PostEngagementMap = {};
  for (const target of targets) {
    const counts = threadCounts[target.path];
    const reactions = reactionStates[`${target.owner}:${target.postId}`];
    const amplify = amplifyCounts[target.path];
    const onRow = painted.get(target.key);
    const viewerRepost = viewerReposts.get(target.path);
    const amplifyCountRaw =
      onRow?.amplifyCount ?? amplify?.amplifyCount ?? null;
    const viewerAmplified =
      Boolean(amplify?.viewerAmplified) ||
      Boolean(viewerAmplifiedMap[target.path]);
    const amplifyCountReady = amplifyCountRaw != null;
    const amplifyCount =
      amplifyCountRaw == null
        ? 0
        : viewerAmplified
          ? Math.max(amplifyCountRaw, 1)
          : amplifyCountRaw;
    // Feed-row publics or a successful lane read — else soft-fill retries.
    const threadCountsReady = Boolean(onRow) || threadsOk;
    const reactionCountReady = Boolean(onRow) || reactionsOk;
    next[target.key] = {
      ...EMPTY_POST_ENGAGEMENT,
      replyCount: onRow?.replyCount ?? counts?.replyCount ?? 0,
      quoteCount: onRow?.quoteCount ?? counts?.quoteCount ?? 0,
      repostCount: onRow?.repostCount ?? counts?.repostCount ?? 0,
      reactionCount: onRow?.reactionCount ?? reactions?.counts.total ?? 0,
      threadCountsReady,
      reactionCountReady,
      amplifyCount,
      amplifyCountReady,
      viewerReacted: (reactions?.viewerReacted.length ?? 0) > 0,
      viewerAmplified,
      viewerSaved: savedPaths.has(target.path),
      viewerReposted: Boolean(viewerRepost),
      viewerRepostId: viewerRepost?.repostId ?? null,
      viewerRepostGroupId: viewerRepost?.groupId ?? null,
      viewerFlagsReady: true,
    };
  }
  return next;
}

/**
 * Live lazy listings + primary Drops for posts on the page — one batched
 * query per lane, matched by `sourcePostPath`. Drop embeds win over lazy
 * when both exist (post → Drop is the primary product).
 */
export async function hydrateLazyScarceEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  if (posts.length === 0) return {};

  const sourcePostPaths = [
    ...new Set(posts.map((post) => postScarceKey(post.accountId, post.postId))),
  ];
  // Bounded well under the 100-row graph tier for a normal feed page; the
  // newest-per-path resolution below tolerates duplicate rows per post.
  const lazyLimit = Math.min(sourcePostPaths.length * 4, 100);
  const dropLimit = Math.min(sourcePostPaths.length * 2, 100);
  const [lazyRows, dropRows] = await Promise.all([
    os.query.scarces
      .activeListings({
        kinds: ['lazy'],
        sourcePostPaths,
        limit: lazyLimit,
      })
      .catch(() => [] as ScarcesActiveListingRow[]),
    os.query.scarces
      .collectionsCurrent({
        sourcePostPaths,
        includeUnavailable: true,
        limit: dropLimit,
      })
      .catch(() => [] as ScarcesCollectionCurrentRow[]),
  ]);

  const bySourcePath = new Map<
    string,
    { embed: PostScarceEmbed; ts: number }
  >();
  for (const row of lazyRows) {
    const source = row.sourcePostPath?.trim();
    if (!source) continue;
    const embed = lazyEmbedFromActiveRow(row);
    if (!embed) continue;
    const prev = bySourcePath.get(source);
    const nextTs = row.listedBlockTimestamp ?? 0;
    if (!prev || nextTs >= prev.ts) {
      bySourcePath.set(source, { embed, ts: nextTs });
    }
  }

  for (const row of dropRows) {
    const source =
      row.sourcePostPath?.trim() ||
      (() => {
        try {
          const extra = row.extraJson ? JSON.parse(row.extraJson) : null;
          const nested =
            extra && typeof extra === 'object' && !Array.isArray(extra)
              ? (extra as Record<string, unknown>).sourcePost
              : null;
          if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            const path = (nested as Record<string, unknown>).path;
            if (typeof path === 'string' && path.trim()) return path.trim();
            const author = (nested as Record<string, unknown>).author;
            const postId = (nested as Record<string, unknown>).postId;
            if (
              typeof author === 'string' &&
              typeof postId === 'string' &&
              author.trim() &&
              postId.trim()
            ) {
              return `${author.trim()}/post/${postId.trim()}`;
            }
          }
        } catch {
          /* ignore */
        }
        return '';
      })();
    if (!source) continue;
    const embed = dropEmbedFromCollectionRow(row);
    if (!embed) continue;
    const prev = bySourcePath.get(source);
    const nextTs = row.createdBlockTimestamp ?? row.createdAt ?? 0;
    // Drop is the primary product — prefer it over a lazy listing.
    if (!prev || prev.embed.status !== 'drop' || nextTs >= prev.ts) {
      bySourcePath.set(source, { embed, ts: nextTs });
    }
  }

  const out: PostScarceEmbedMap = {};
  for (const post of posts) {
    const key = postScarceKey(post.accountId, post.postId);
    const hit = bySourcePath.get(key);
    if (hit) out[key] = hit.embed;
  }
  return out;
}

/** Empty engagement row so icons paint immediately while counts hydrate. */
export function engagementOrEmpty(
  map: PostEngagementMap | undefined,
  key: string
): PostEngagement {
  return map?.[key] ?? EMPTY_POST_ENGAGEMENT;
}

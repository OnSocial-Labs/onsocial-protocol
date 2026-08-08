import {
  postContentPath,
  type OnSocial,
  type PostRow,
  type PostScarceEmbed,
  type ScarcesActiveListingRow,
  type ScarcesCollectionCurrentRow,
} from '@onsocial/sdk';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { postScarceKey } from '@/features/scarces/scarce-embed-ledger';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { EMPTY_POST_ENGAGEMENT } from '@/hooks/use-post-engagement';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { postKey } from '@/lib/post-display';

export type PostEngagementMap = Record<string, PostEngagement>;
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
  const appId = row.appId?.trim() || undefined;
  const mediumKind = row.mediumKind?.trim().toLowerCase() || undefined;
  return {
    status: 'lazy_listing',
    listingId,
    ...(appId ? { appId } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...(priceNear ? { priceNear } : {}),
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
  return {
    status,
    collectionId,
    ...(appId ? { appId } : {}),
    ...(seriesId ? { seriesId } : {}),
    ...(seriesTitle ? { seriesTitle } : {}),
    ...(mediumKind ? { mediumKind } : {}),
    ...(priceNear ? { priceNear } : {}),
    ...(copies != null ? { copies } : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    events: [],
  };
}

/**
 * Batched reply/quote/reaction/amplify counts for feed/thread first paint.
 * Viewer flags stay false until the client soft-upgrades with a wallet.
 */
export async function loadPostEngagementMap(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostEngagementMap> {
  if (posts.length === 0) return {};

  const targets = posts.map((post) => ({
    key: postKey(post),
    path: postContentPath(post),
    owner: post.accountId,
    postId: post.postId,
  }));
  const paths = targets.map((t) => t.path);

  const [threadResult, reactionResult, amplifyResult] =
    await Promise.allSettled([
      os.query.threads.countsByPaths(paths),
      os.query.reactions.statesForPosts(
        targets.map((t) => ({ owner: t.owner, postId: t.postId }))
      ),
      os.query.socialSpend.amplifyCountsForPostPaths(paths),
    ]);

  const threadCounts =
    threadResult.status === 'fulfilled' ? threadResult.value : {};
  const reactionStates =
    reactionResult.status === 'fulfilled' ? reactionResult.value : {};
  const amplifyCounts =
    amplifyResult.status === 'fulfilled' ? amplifyResult.value : {};

  const next: PostEngagementMap = {};
  for (const target of targets) {
    const counts = threadCounts[target.path];
    const reactions = reactionStates[`${target.owner}:${target.postId}`];
    const amplify = amplifyCounts[target.path];
    next[target.key] = {
      replyCount: counts?.replyCount ?? 0,
      quoteCount: counts?.quoteCount ?? 0,
      reactionCount: reactions?.counts.total ?? 0,
      viewerReacted: false,
      amplifyCount: amplify?.amplifyCount ?? 0,
      viewerAmplified: false,
    };
  }
  return next;
}

/**
 * Live lazy listings + primary Drops for posts on the page — one query per
 * distinct creator, matched by `sourcePostPath`. Drop embeds win over lazy
 * when both exist (post → Drop is the primary product).
 */
export async function hydrateLazyScarceEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  if (posts.length === 0) return {};

  const creators = [
    ...new Set(posts.map((post) => post.accountId.trim()).filter(Boolean)),
  ];
  const [listingsByCreator, dropsByCreator] = await Promise.all([
    Promise.all(
      creators.map(async (sellerId) => {
        try {
          const rows = await os.query.scarces.activeListings({
            sellerId,
            kinds: ['lazy'],
            limit: 40,
          });
          return [sellerId, rows] as const;
        } catch {
          return [sellerId, [] as ScarcesActiveListingRow[]] as const;
        }
      })
    ),
    Promise.all(
      creators.map(async (creatorId) => {
        try {
          const rows = await os.query.scarces.collectionsCurrent({
            creatorId,
            includeUnavailable: true,
            limit: 40,
          });
          return [creatorId, rows] as const;
        } catch {
          return [creatorId, [] as const] as const;
        }
      })
    ),
  ]);

  const bySourcePath = new Map<
    string,
    { embed: PostScarceEmbed; ts: number }
  >();
  for (const [, rows] of listingsByCreator) {
    for (const row of rows) {
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
  }

  for (const [, rows] of dropsByCreator) {
    for (const row of rows) {
      const source =
        row.sourcePostPath?.trim() ||
        (() => {
          try {
            const extra = row.extraJson ? JSON.parse(row.extraJson) : null;
            const nested =
              extra && typeof extra === 'object' && !Array.isArray(extra)
                ? (extra as Record<string, unknown>).sourcePost
                : null;
            if (
              nested &&
              typeof nested === 'object' &&
              !Array.isArray(nested)
            ) {
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

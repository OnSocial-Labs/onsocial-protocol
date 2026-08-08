import {
  postContentPath,
  type OnSocial,
  type PostRow,
  type PostScarceEmbed,
  type ScarcesActiveListingRow,
} from '@onsocial/sdk';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { postScarceKey } from '@/features/scarces/scarce-embed-ledger';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { EMPTY_POST_ENGAGEMENT } from '@/hooks/use-post-engagement';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { postKey } from '@/lib/post-display';

export type PostEngagementMap = Record<string, PostEngagement>;
export type PostScarceEmbedMap = Record<string, PostScarceEmbed>;

function priceNearFromYocto(raw: string | null | undefined): string | undefined {
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
  return {
    status: 'lazy_listing',
    listingId,
    ...(priceNear ? { priceNear } : {}),
    ...(typeof row.copies === 'number' ? { copies: row.copies } : {}),
    ...(typeof row.remaining === 'number' ? { remaining: row.remaining } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(cardBg ? { cardBg } : {}),
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

  const [threadResult, reactionResult, amplifyResult] = await Promise.allSettled(
    [
      os.query.threads.countsByPaths(paths),
      os.query.reactions.statesForPosts(
        targets.map((t) => ({ owner: t.owner, postId: t.postId }))
      ),
      os.query.socialSpend.amplifyCountsForPostPaths(paths),
    ]
  );

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
 * Live lazy listings for posts on the page — one `activeListings` per distinct
 * creator, matched by `sourcePostPath`. No N× get_lazy_listing.
 */
export async function hydrateLazyScarceEmbedsForPosts(
  os: OnSocial,
  posts: readonly PostRow[]
): Promise<PostScarceEmbedMap> {
  if (posts.length === 0) return {};

  const creators = [
    ...new Set(posts.map((post) => post.accountId.trim()).filter(Boolean)),
  ];
  const listingsByCreator = await Promise.all(
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
  );

  const bySourcePath = new Map<string, { embed: PostScarceEmbed; ts: number }>();
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

import type { OnSocial, PostRow } from '@onsocial/sdk';
import {
  articleCoverUrl,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { postKey } from '@/lib/post-display';

export type WritingArticleCoverHint = {
  /** Raster / IPFS cover when the piece has media or a minted scarce cover. */
  mediaUrl: string | null;
  /** Text-card mood from scarce theme when no photo cover. */
  cardBg: string | null;
};

function normalizeHintMedia(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() || null;
  if (!trimmed) return null;
  return resolveScarceMediaUrl(trimmed) ?? trimmed;
}

/**
 * Legacy cover hints for pre-pin articles only: a post still or a pinned
 * payload mood resolves on its own, so those pieces skip the scarce lookup.
 * Everything else falls back to the minted scarce embed (media + theme).
 */
export async function hydrateWritingArticleCovers(
  articles: PostRow[],
  os: OnSocial
): Promise<Record<string, WritingArticleCoverHint>> {
  const out: Record<string, WritingArticleCoverHint> = {};

  await Promise.all(
    articles.map(async (post) => {
      const key = postKey(post);
      const local = articleCoverUrl(post.value);
      if (local) {
        out[key] = { mediaUrl: local, cardBg: null };
        return;
      }
      if (parseArticleSnapshot(post.value)?.cover?.mood) {
        out[key] = { mediaUrl: null, cardBg: null };
        return;
      }

      try {
        const embed = await os.scarces.fromPost.embed({
          author: post.accountId,
          postId: post.postId,
        });
        out[key] = {
          mediaUrl: normalizeHintMedia(embed.mediaUrl),
          cardBg: embed.cardBg?.trim() || null,
        };
      } catch {
        out[key] = { mediaUrl: null, cardBg: null };
      }
    })
  );

  return out;
}

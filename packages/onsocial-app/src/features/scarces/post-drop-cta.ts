import type { PostScarceEmbed } from '@onsocial/sdk';

export type PostDropCtaKind = 'mint' | 'buy' | 'bid' | 'open' | 'muted';

export interface PostDropCtaResolution {
  kind: PostDropCtaKind;
  /** Author-facing muted copy when kind is muted. */
  mutedLabel?: 'Your Drop' | 'Your edition';
}

/** Primary sale — Mint (not Buy). Secondary market uses Buy. */
export function isPrimaryMintStatus(
  status: PostScarceEmbed['status'] | null | undefined
): boolean {
  return status === 'drop' || status === 'lazy_listing';
}

/**
 * Creator vs holder CTA rules for durable collection embeds (and Drop
 * fromPost embeds treated the same when `collectionId` is present).
 */
export function resolvePostDropCta(input: {
  embed: PostScarceEmbed;
  isPostAuthor: boolean;
}): PostDropCtaResolution {
  const { embed, isPostAuthor } = input;
  const hasTokenId = Boolean(embed.tokenId?.trim());
  const remaining =
    typeof embed.remaining === 'number' && Number.isFinite(embed.remaining)
      ? embed.remaining
      : null;

  if (isPostAuthor) {
    return {
      kind: 'muted',
      mutedLabel: hasTokenId ? 'Your edition' : 'Your Drop',
    };
  }

  // Holder reference: Buy / Bid when their edition is listed; else Open Drop.
  if (hasTokenId) {
    if (embed.status === 'listed') return { kind: 'buy' };
    if (embed.status === 'auction') return { kind: 'bid' };
    return { kind: 'open' };
  }

  // Creator / primary Drop: Mint while supply left; else Open Drop.
  if (embed.status === 'drop' && (remaining == null || remaining > 0)) {
    return { kind: 'mint' };
  }

  return { kind: 'open' };
}

export function postDropIsPlayable(embed: PostScarceEmbed | null): boolean {
  if (!embed) return false;
  const medium = (embed.mediumKind ?? '').trim().toLowerCase();
  return medium === 'audio' || medium === 'music';
}

export function postDropIsReadable(embed: PostScarceEmbed | null): boolean {
  if (!embed) return false;
  const medium = (embed.mediumKind ?? '').trim().toLowerCase();
  return (
    medium === 'writing' ||
    medium === 'article' ||
    medium === 'book' ||
    medium === 'text'
  );
}

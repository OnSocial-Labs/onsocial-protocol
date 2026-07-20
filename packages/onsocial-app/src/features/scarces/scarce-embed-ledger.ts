import type { PostScarceEmbed } from '@onsocial/sdk';

type Listener = () => void;

const overrides = new Map<string, PostScarceEmbed>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function postScarceKey(accountId: string, postId: string): string {
  return `${accountId}/post/${postId}`;
}

export function getScarceEmbedOverride(key: string): PostScarceEmbed | null {
  return overrides.get(key) ?? null;
}

export function setScarceEmbedOverride(
  key: string,
  embed: PostScarceEmbed
): void {
  overrides.set(key, embed);
  emit();
}

export function clearScarceEmbedOverride(key: string): void {
  if (!overrides.delete(key)) return;
  emit();
}

export function subscribeScarceEmbedLedger(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Drop the optimistic override once the indexer agrees (or has moved past it).
 * Returns true when the override was cleared.
 */
export function reconcileScarceEmbedFromApi(
  key: string,
  fetched: PostScarceEmbed
): boolean {
  const override = overrides.get(key);
  if (!override) return false;

  if (override.status === 'lazy_listing' || override.status === 'listed') {
    if (
      (fetched.status === 'lazy_listing' || fetched.status === 'listed') &&
      Boolean(fetched.listingId || fetched.tokenId)
    ) {
      clearScarceEmbedOverride(key);
      return true;
    }
    if (fetched.status === 'sold') {
      clearScarceEmbedOverride(key);
      return true;
    }
  }

  if (override.status === 'sold') {
    // Multi-copy: chain still has the listing — drop the premature sold hint.
    if (fetched.status === 'lazy_listing' || fetched.status === 'listed') {
      clearScarceEmbedOverride(key);
      return true;
    }
    if (fetched.status === 'sold') {
      clearScarceEmbedOverride(key);
      return true;
    }
  }

  // Cancel / delist — wait until indexer no longer shows an active listing.
  if (
    override.status === 'none' &&
    (fetched.status === 'none' ||
      fetched.status === 'minted' ||
      fetched.status === 'sold')
  ) {
    clearScarceEmbedOverride(key);
    return true;
  }

  return false;
}

/**
 * Merge indexer embed with a local optimistic override.
 * Override status wins; fill missing listing/token/price from the fetch.
 */
export function resolveScarceEmbed(
  key: string,
  fetched: PostScarceEmbed | null
): PostScarceEmbed | null {
  const override = getScarceEmbedOverride(key);
  if (!override) return fetched;
  if (!fetched) return override;

  if (override.status === 'none') {
    return {
      ...fetched,
      status: 'none',
      events: fetched.events.length > 0 ? fetched.events : override.events,
    };
  }

  if (
    (override.status === 'lazy_listing' || override.status === 'listed') &&
    (fetched.status === override.status || fetched.status === 'none')
  ) {
    return {
      ...fetched,
      ...override,
      listingId: override.listingId ?? fetched.listingId,
      tokenId: override.tokenId ?? fetched.tokenId,
      priceNear: override.priceNear ?? fetched.priceNear,
      cardBg: override.cardBg ?? fetched.cardBg,
      copies: override.copies ?? fetched.copies,
      remaining: override.remaining ?? fetched.remaining,
      events: fetched.events.length > 0 ? fetched.events : override.events,
    };
  }

  // Optimistic sold must not hide a still-live multi-copy listing.
  if (
    override.status === 'sold' &&
    (fetched.status === 'lazy_listing' || fetched.status === 'listed')
  ) {
    return fetched;
  }

  return override;
}

import type { PostScarceEmbed } from '@onsocial/sdk';

type Listener = () => void;

const overrides = new Map<string, PostScarceEmbed>();
/** SSR / page-level activeListings seed — first paint before per-card IO. */
const ssrSeeds = new Map<string, PostScarceEmbed>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function postScarceKey(accountId: string, postId: string): string {
  return `${accountId}/post/${postId}`;
}

function scarceSeedPaintEqual(
  a: PostScarceEmbed,
  b: PostScarceEmbed
): boolean {
  return (
    a.status === b.status &&
    a.listingId === b.listingId &&
    a.collectionId === b.collectionId &&
    a.tokenId === b.tokenId &&
    a.priceNear === b.priceNear &&
    a.remaining === b.remaining &&
    a.copies === b.copies &&
    a.mediaUrl === b.mediaUrl &&
    a.appId === b.appId
  );
}

/**
 * Seed lazy CTAs from SSR / page hydrate (safe during render; emits on change).
 * Overwrites stale seeds when paint data changes; never clobbers live overrides.
 */
export function seedScarceEmbedsFromSsr(
  map: Record<string, PostScarceEmbed> | null | undefined
): void {
  if (!map) return;
  let changed = false;
  for (const [key, embed] of Object.entries(map)) {
    if (!key || !embed) continue;
    if (overrides.has(key)) continue;
    const previous = ssrSeeds.get(key);
    if (previous && scarceSeedPaintEqual(previous, embed)) continue;
    ssrSeeds.set(key, embed);
    changed = true;
  }
  if (changed) emit();
}

export function getScarceEmbedSeed(key: string): PostScarceEmbed | null {
  return ssrSeeds.get(key) ?? null;
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
      // Stale creator listings cache can still return a cancelled listing —
      // don't drop a seeded override for a different listing id.
      if (
        override.listingId &&
        fetched.listingId &&
        override.listingId !== fetched.listingId
      ) {
        return false;
      }
      if (
        override.tokenId &&
        fetched.tokenId &&
        override.tokenId !== fetched.tokenId
      ) {
        return false;
      }
      clearScarceEmbedOverride(key);
      return true;
    }
    if (fetched.status === 'sold') {
      clearScarceEmbedOverride(key);
      return true;
    }
  }

  if (override.status === 'drop') {
    if (
      fetched.status === 'drop' &&
      fetched.collectionId &&
      (!override.collectionId || override.collectionId === fetched.collectionId)
    ) {
      clearScarceEmbedOverride(key);
      return true;
    }
    if (fetched.status === 'sold' && fetched.collectionId) {
      clearScarceEmbedOverride(key);
      return true;
    }
  }

  if (override.status === 'sold') {
    // Multi-copy: chain still has the listing — drop the premature sold hint.
    if (
      fetched.status === 'lazy_listing' ||
      fetched.status === 'listed' ||
      fetched.status === 'drop'
    ) {
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
    // Cover art is listing-scoped — never inherit a prior listing's media.
    const sameListing =
      !override.listingId ||
      !fetched.listingId ||
      override.listingId === fetched.listingId;
    return {
      ...fetched,
      ...override,
      listingId: override.listingId ?? fetched.listingId,
      tokenId: override.tokenId ?? fetched.tokenId,
      priceNear: override.priceNear ?? fetched.priceNear,
      cardBg: override.cardBg ?? (sameListing ? fetched.cardBg : undefined),
      mediaUrl:
        override.mediaUrl ?? (sameListing ? fetched.mediaUrl : undefined),
      copies: override.copies ?? fetched.copies,
      remaining: override.remaining ?? fetched.remaining,
      events: fetched.events.length > 0 ? fetched.events : override.events,
    };
  }

  if (
    override.status === 'drop' &&
    (fetched.status === 'drop' || fetched.status === 'none')
  ) {
    const sameDrop =
      !override.collectionId ||
      !fetched.collectionId ||
      override.collectionId === fetched.collectionId;
    return {
      ...fetched,
      ...override,
      collectionId: override.collectionId ?? fetched.collectionId,
      appId: override.appId ?? fetched.appId,
      seriesId: override.seriesId ?? fetched.seriesId,
      priceNear: override.priceNear ?? fetched.priceNear,
      mediaUrl: override.mediaUrl ?? (sameDrop ? fetched.mediaUrl : undefined),
      copies: override.copies ?? fetched.copies,
      remaining: override.remaining ?? fetched.remaining,
      events: fetched.events.length > 0 ? fetched.events : override.events,
    };
  }

  // Optimistic sold must not hide a still-live multi-copy listing / Drop.
  if (
    override.status === 'sold' &&
    (fetched.status === 'lazy_listing' ||
      fetched.status === 'listed' ||
      fetched.status === 'drop')
  ) {
    return fetched;
  }

  return override;
}

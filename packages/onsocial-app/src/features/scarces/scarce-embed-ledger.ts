import type { PostScarceEmbed } from '@onsocial/sdk';

type Listener = () => void;

/** SSR seeds for painted scarce CTAs — capped so deep scroll cannot grow forever. */
export const SCARCE_EMBED_SEED_CACHE_LIMIT = 200;
/** Optimistic overrides are rarer; keep a smaller LRU. */
export const SCARCE_EMBED_OVERRIDE_CACHE_LIMIT = 64;

const overrides = new Map<string, PostScarceEmbed>();
/** SSR / page-level activeListings seed — first paint before per-card IO. */
const ssrSeeds = new Map<string, PostScarceEmbed>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function setLruMapEntry<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  limit: number
): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}

function touchLruMapEntry<T>(map: Map<string, T>, key: string): T | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as T;
  map.delete(key);
  map.set(key, value);
  return value;
}

/** Test hook — drop seed + override maps between specs. */
export function clearScarceEmbedLedger(): void {
  overrides.clear();
  ssrSeeds.clear();
}

export function scarceEmbedSeedCacheSize(): number {
  return ssrSeeds.size;
}

export function scarceEmbedOverrideCacheSize(): number {
  return overrides.size;
}

export function postScarceKey(accountId: string, postId: string): string {
  return `${accountId}/post/${postId}`;
}

function scarceSeedPaintEqual(a: PostScarceEmbed, b: PostScarceEmbed): boolean {
  return (
    a.status === b.status &&
    a.listingId === b.listingId &&
    a.collectionId === b.collectionId &&
    a.tokenId === b.tokenId &&
    a.priceNear === b.priceNear &&
    a.usdE6 === b.usdE6 &&
    a.remaining === b.remaining &&
    a.copies === b.copies &&
    a.mediaUrl === b.mediaUrl &&
    a.appId === b.appId
  );
}

function embedHasPaintedPrice(embed: PostScarceEmbed): boolean {
  return Boolean(embed.usdE6?.trim() || embed.priceNear?.trim());
}

/** Live CTA only when ask/terminal state is known — jacket paint alone holds the seat. */
export function scarceEmbedCommercePaintReady(
  embed: PostScarceEmbed | null | undefined
): boolean {
  if (!embed) return false;
  if (embed.status === 'none') return false;
  if (embed.status === 'sold' || embed.status === 'minted') return true;
  return embedHasPaintedPrice(embed);
}

/**
 * Quiet refresh may update sold / remaining in place, but the painted
 * currency and ask must not rewrite under a scrolling reader.
 */
export function stickScarceCommercePaint(
  previous: PostScarceEmbed | null | undefined,
  fetched: PostScarceEmbed
): PostScarceEmbed {
  if (!previous || !embedHasPaintedPrice(previous)) return fetched;
  const hadDollars = Boolean(previous.usdE6?.trim());
  const next: PostScarceEmbed = {
    ...fetched,
    priceNear: previous.priceNear,
  };
  if (hadDollars) {
    next.usdE6 = previous.usdE6;
  } else if ('usdE6' in next) {
    delete next.usdE6;
  }
  return next;
}

/**
 * Seed lazy CTAs from SSR / page hydrate.
 * Render callers must not notify — emit would setState in subscribed cards
 * during another component's render. Snapshot reads pick up the map in the
 * same pass. Pass `{ notify: true }` only from effects / async hydrate.
 */
export function seedScarceEmbedsFromSsr(
  map: Record<string, PostScarceEmbed> | null | undefined,
  options?: { notify?: boolean }
): void {
  if (!map) return;
  let changed = false;
  for (const [key, embed] of Object.entries(map)) {
    if (!key || !embed) continue;
    if (overrides.has(key)) continue;
    const previous = ssrSeeds.get(key);
    // First seed takes indexer truth (incl. usdE6). Later seeds stick ask /
    // currency so soft refresh never rewrites under a scrolling reader.
    const next = stickScarceCommercePaint(previous, embed);
    if (previous && scarceSeedPaintEqual(previous, next)) {
      touchLruMapEntry(ssrSeeds, key);
      continue;
    }
    setLruMapEntry(ssrSeeds, key, next, SCARCE_EMBED_SEED_CACHE_LIMIT);
    changed = true;
  }
  if (changed && options?.notify) emit();
}

/**
 * Persist a per-card indexer fetch so recycled feed cards remount with
 * commerce already painted. Sticks currency/ask from the first paint;
 * sold / remaining may still update in place.
 */
export function rememberScarceEmbedFetch(
  key: string,
  fetched: PostScarceEmbed,
  options?: { notify?: boolean }
): void {
  if (!key) return;
  const previous = ssrSeeds.get(key);
  const next = stickScarceCommercePaint(previous, fetched);
  if (previous && scarceSeedPaintEqual(previous, next)) {
    touchLruMapEntry(ssrSeeds, key);
    return;
  }
  setLruMapEntry(ssrSeeds, key, next, SCARCE_EMBED_SEED_CACHE_LIMIT);
  if (options?.notify !== false) emit();
}

export function getScarceEmbedSeed(key: string): PostScarceEmbed | null {
  return touchLruMapEntry(ssrSeeds, key) ?? null;
}

export function getScarceEmbedOverride(key: string): PostScarceEmbed | null {
  return touchLruMapEntry(overrides, key) ?? null;
}

/** Feed ledger → sheet/session seed so CTA chrome does not remount empty. */
export function scarceEmbedsForOpenRoot(input: {
  accountId: string;
  postId: string;
}): Record<string, PostScarceEmbed> {
  const key = postScarceKey(input.accountId, input.postId);
  const embed = getScarceEmbedOverride(key) ?? getScarceEmbedSeed(key);
  return embed ? { [key]: embed } : {};
}

export function setScarceEmbedOverride(
  key: string,
  embed: PostScarceEmbed
): void {
  setLruMapEntry(overrides, key, embed, SCARCE_EMBED_OVERRIDE_CACHE_LIMIT);
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
      // Keep mint PNG / cover until indexer media lands — clearing early
      // flashes live SVG (softer / blurrier than the stamped raster).
      if (override.mediaUrl?.trim() && !fetched.mediaUrl?.trim()) {
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
      if (override.mediaUrl?.trim() && !fetched.mediaUrl?.trim()) {
        return false;
      }
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
      usdE6: override.usdE6 ?? fetched.usdE6,
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
      usdE6: override.usdE6 ?? fetched.usdE6,
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

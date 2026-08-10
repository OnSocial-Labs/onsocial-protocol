'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import {
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  postScarceKey,
  reconcileScarceEmbedFromApi,
  resolveScarceEmbed,
  subscribeScarceEmbedLedger,
} from '@/features/scarces/scarce-embed-ledger';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import {
  parseDropPaintSnapshot,
  parsePostTokenEmbed,
} from '@/lib/post-display';
import type { PostScarceEmbedStatus } from '@/features/scarces/use-post-scarce-embed';

const RECONCILE_RETRY_MS = [2_000, 5_000] as const;

function priceNearFromYocto(
  raw: string | null | undefined
): string | undefined {
  if (!raw?.trim() || !/^\d+$/.test(raw.trim())) return undefined;
  return yoctoToNear(raw.trim());
}

function paintToTokenEmbed(
  tokenId: string,
  paint: ReturnType<typeof parseDropPaintSnapshot>
): PostScarceEmbed {
  return {
    status: 'listed',
    tokenId,
    ...(paint?.collectionId ? { collectionId: paint.collectionId } : {}),
    ...(paint?.mediumKind ? { mediumKind: paint.mediumKind } : {}),
    ...(paint?.mediaUrl ? { mediaUrl: paint.mediaUrl } : {}),
    events: [],
  };
}

/**
 * Resolves durable `embeds[].kind === 'token'` (post-minted resale announce)
 * via the post author's active listings. Sibling of
 * {@link usePostCollectionEmbed}.
 */
export function usePostTokenEmbed(
  post: PostRow,
  opts: { enabled?: boolean; force?: boolean } = {}
) {
  const parsed = parsePostTokenEmbed(post.value);
  const enabled = opts.enabled !== false && Boolean(parsed);
  const force = Boolean(opts.force);
  const key = postScarceKey(post.accountId, post.postId);
  const rootRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [fetched, setFetched] = useState<PostScarceEmbed | null>(null);
  const [dropTitle, setDropTitle] = useState<string | null>(null);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const override = useSyncExternalStore(
    subscribeScarceEmbedLedger,
    () => getScarceEmbedOverride(key),
    () => null
  );
  const seed = useSyncExternalStore(
    subscribeScarceEmbedLedger,
    () => getScarceEmbedSeed(key),
    () => getScarceEmbedSeed(key)
  );

  const shouldFetch = enabled && (force || inView);

  useEffect(() => {
    if (!enabled) return;
    const node = rootRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, key]);

  useEffect(() => {
    if (!shouldFetch || !parsed) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const tokenId = parsed.tokenId;
    const paint = parseDropPaintSnapshot(post.value);

    void (async () => {
      try {
        let resolved = paintToTokenEmbed(tokenId, paint);
        if (!cancelled) {
          setDropTitle(paint?.title ?? null);
        }

        try {
          const listed = await client.query.scarces.activeListings({
            sellerId: post.accountId,
            kinds: ['native', 'auction'],
            limit: 40,
          });
          const hit = listed.find(
            (entry) =>
              entry.tokenId?.trim() === tokenId &&
              (entry.kind === 'native' || entry.kind === 'auction')
          );
          if (hit?.kind === 'native' && hit.tokenId) {
            const listPrice = priceNearFromYocto(hit.price);
            const mediaUrl = hit.media?.trim()
              ? resolveScarceMediaUrl(hit.media.trim()) ?? hit.media.trim()
              : undefined;
            if (!cancelled && hit.title?.trim()) {
              setDropTitle(hit.title.trim());
            }
            resolved = {
              ...resolved,
              status: 'listed',
              tokenId: hit.tokenId.trim(),
              ...(hit.listingId?.trim()
                ? { listingId: hit.listingId.trim() }
                : {}),
              ...(listPrice ? { priceNear: listPrice } : {}),
              ...(mediaUrl ? { mediaUrl } : {}),
              ...(hit.mediumKind?.trim()
                ? { mediumKind: hit.mediumKind.trim().toLowerCase() }
                : {}),
            };
          } else if (hit?.kind === 'auction' && hit.tokenId) {
            const listPrice = priceNearFromYocto(
              hit.highestBid ?? hit.reservePrice
            );
            const mediaUrl = hit.media?.trim()
              ? resolveScarceMediaUrl(hit.media.trim()) ?? hit.media.trim()
              : undefined;
            if (!cancelled && hit.title?.trim()) {
              setDropTitle(hit.title.trim());
            }
            resolved = {
              ...resolved,
              status: 'auction',
              tokenId: hit.tokenId.trim(),
              ...(listPrice ? { priceNear: listPrice } : {}),
              ...(mediaUrl ? { mediaUrl } : {}),
              ...(hit.mediumKind?.trim()
                ? { mediumKind: hit.mediumKind.trim().toLowerCase() }
                : {}),
            };
          }
        } catch {
          /* keep paint baseline */
        }

        if (cancelled) return;
        reconcileScarceEmbedFromApi(key, resolved);
        setFetched(resolved);
        setFetchedKey(key);
      } catch {
        if (cancelled) return;
        setErrorKey(key);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    shouldFetch,
    key,
    parsed?.tokenId,
    post.accountId,
    post.value,
    retryKey,
  ]);

  useEffect(() => {
    if (!override || !shouldFetch) return;
    const timers = RECONCILE_RETRY_MS.map((ms) =>
      window.setTimeout(() => {
        setRetryKey((value) => value + 1);
      }, ms)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [override, shouldFetch, key]);

  const paint = parseDropPaintSnapshot(post.value);
  const paintBaseline =
    parsed && !seed && !fetched
      ? paintToTokenEmbed(parsed.tokenId, paint)
      : null;
  const baseline =
    fetchedKey === key && fetched != null
      ? fetched
      : (seed ?? paintBaseline);
  const embed = enabled ? resolveScarceEmbed(key, baseline) : null;

  const status: PostScarceEmbedStatus =
    !enabled
      ? 'idle'
      : fetchedKey === key || seed != null || paintBaseline != null
        ? 'ready'
        : errorKey === key
          ? 'error'
          : shouldFetch
            ? 'loading'
            : 'idle';

  return {
    rootRef,
    embed,
    dropTitle,
    hasTokenEmbed: Boolean(parsed),
    status,
    retry: () => setRetryKey((value) => value + 1),
  };
}

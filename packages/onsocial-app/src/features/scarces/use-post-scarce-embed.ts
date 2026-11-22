'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import {
  findLiveListingForPost,
  resolveScarceMediaUrl,
} from '@/features/market/market-listings';
import {
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  postScarceKey,
  reconcileScarceEmbedFromApi,
  rememberScarceEmbedFetch,
  resolveScarceEmbed,
  scarceEmbedCommercePaintReady,
  setScarceEmbedOverride,
  subscribeScarceEmbedLedger,
} from '@/features/scarces/scarce-embed-ledger';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { yoctoToNear } from '@/lib/app-near-rpc';

export type PostScarceEmbedStatus = 'idle' | 'loading' | 'ready' | 'error';

const RECONCILE_RETRY_MS = [2_000, 5_000] as const;

function priceNearFromYocto(
  raw: string | null | undefined
): string | undefined {
  if (!raw?.trim() || !/^\d+$/.test(raw.trim())) return undefined;
  return yoctoToNear(raw.trim());
}

function isActivelyListed(embed: PostScarceEmbed | null): boolean {
  if (!embed) return false;
  return (
    embed.status === 'lazy_listing' ||
    embed.status === 'drop' ||
    embed.status === 'listed' ||
    embed.status === 'auction'
  );
}

/**
 * Resolves post scarce CTAs. SSR / page / remembered seeds paint immediately;
 * quiet indexer refresh runs when the card enters view (or `force` — author ⋮).
 * Fetches land in the ledger so recycled cards remount without a pop.
 * Optimistic overrides win until the indexer catches up. RPC stays at buy.
 */
export function usePostScarceEmbed(
  post: PostRow,
  opts: { enabled?: boolean; force?: boolean } = {}
) {
  const enabled = opts.enabled !== false;
  const force = Boolean(opts.force);
  const key = postScarceKey(post.accountId, post.postId);
  const rootRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
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

  // Skip when seed settled (ask ready, or confirmed `none`). force / override
  // still refresh. Do not treat `none` as "needs fill" — that re-fetched every
  // plain post and parked a loading seat under the engagement row.
  const shouldFetch =
    enabled &&
    (force || inView) &&
    (force ||
      Boolean(override) ||
      seed == null ||
      (seed.status !== 'none' && !scarceEmbedCommercePaintReady(seed)));

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
    if (!shouldFetch) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const author = post.accountId;
    const postId = post.postId;
    void client.scarces.fromPost
      .embed({ author, postId })
      .then(async (embed) => {
        let resolved = embed;
        // Prefer a still-live primary lazy mint over a secondary list/auction
        // event (e.g. holder resale of an earlier edition from this post).
        const livePrimary = await findLiveListingForPost(
          author,
          author,
          postId
        );
        const primaryLive =
          livePrimary?.listingId &&
          (livePrimary.remaining == null || livePrimary.remaining > 0);

        if (primaryLive) {
          const { tokenId: _secondaryToken, ...withoutToken } = embed;
          resolved = {
            ...withoutToken,
            status: 'lazy_listing',
            listingId: livePrimary.listingId,
            priceNear: livePrimary.priceNear,
            ...(livePrimary.usdE6?.trim()
              ? { usdE6: livePrimary.usdE6.trim() }
              : {}),
            ...(livePrimary.mediaUrl ? { mediaUrl: livePrimary.mediaUrl } : {}),
            ...(livePrimary.cardBg ? { cardBg: livePrimary.cardBg } : {}),
            ...(livePrimary.copies != null
              ? { copies: livePrimary.copies }
              : {}),
            ...(livePrimary.remaining != null
              ? { remaining: livePrimary.remaining }
              : {}),
          };
        } else if (!isActivelyListed(embed)) {
          if (livePrimary?.listingId) {
            resolved = {
              ...embed,
              status: 'lazy_listing',
              listingId: livePrimary.listingId,
              priceNear: livePrimary.priceNear,
              ...(livePrimary.usdE6?.trim()
                ? { usdE6: livePrimary.usdE6.trim() }
                : {}),
              ...(livePrimary.mediaUrl
                ? { mediaUrl: livePrimary.mediaUrl }
                : {}),
              ...(livePrimary.cardBg ? { cardBg: livePrimary.cardBg } : {}),
              ...(livePrimary.copies != null
                ? { copies: livePrimary.copies }
                : {}),
              ...(livePrimary.remaining != null
                ? { remaining: livePrimary.remaining }
                : {}),
            };
          }
        } else if (
          (embed.status === 'listed' || embed.status === 'auction') &&
          embed.tokenId?.trim()
        ) {
          // Indexer listing by tokenId — media + ask without chain RPC.
          const tokenId = embed.tokenId.trim();
          const listed = await client.query.scarces
            .activeListings({
              kinds: ['native', 'auction'],
              tokenIds: [tokenId],
              limit: 1,
            })
            .catch(() => []);
          const hit = listed[0];
          if (hit?.kind === 'native' && hit.tokenId) {
            const listPrice = priceNearFromYocto(hit.price);
            const mediaUrl = hit.media?.trim()
              ? (resolveScarceMediaUrl(hit.media.trim()) ?? undefined)
              : undefined;
            resolved = {
              ...resolved,
              status: 'listed',
              tokenId: hit.tokenId.trim(),
              ...(hit.listingId?.trim()
                ? { listingId: hit.listingId.trim() }
                : {}),
              ...(listPrice ? { priceNear: listPrice } : {}),
              ...(hit.usdE6?.trim() ? { usdE6: hit.usdE6.trim() } : {}),
              ...(mediaUrl ? { mediaUrl } : {}),
            };
          } else if (hit?.kind === 'auction' && hit.tokenId) {
            const listPrice = priceNearFromYocto(
              hit.highestBid ?? hit.reservePrice
            );
            const mediaUrl = hit.media?.trim()
              ? (resolveScarceMediaUrl(hit.media.trim()) ?? undefined)
              : undefined;
            resolved = {
              ...resolved,
              status: 'auction',
              tokenId: hit.tokenId.trim(),
              ...(listPrice ? { priceNear: listPrice } : {}),
              ...(mediaUrl ? { mediaUrl } : {}),
            };
          }
        }
        if (cancelled) return;
        reconcileScarceEmbedFromApi(key, resolved);
        rememberScarceEmbedFetch(key, resolved);
        setErrorKey((current) => (current === key ? null : current));
      })
      .catch(() => {
        if (cancelled) return;
        setErrorKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, key, post.accountId, post.postId, retryKey]);

  // Soft-retry while an optimistic override is waiting on the indexer.
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

  // If list succeeded but listingId wasn't in the relay payload, read it from
  // the indexer so cancel / buy can proceed before that row lands.
  useEffect(() => {
    if (
      !override ||
      override.status !== 'lazy_listing' ||
      override.listingId ||
      !shouldFetch
    ) {
      return;
    }
    let cancelled = false;
    void findLiveListingForPost(
      post.accountId,
      post.accountId,
      post.postId
    ).then((live) => {
      if (cancelled || !live?.listingId) return;
      const current = getScarceEmbedOverride(key);
      if (!current || current.status !== 'lazy_listing' || current.listingId) {
        return;
      }
      setScarceEmbedOverride(key, {
        ...current,
        listingId: live.listingId,
        priceNear: current.priceNear ?? live.priceNear,
        ...(current.usdE6?.trim()
          ? { usdE6: current.usdE6 }
          : live.usdE6?.trim()
            ? { usdE6: live.usdE6.trim() }
            : {}),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [override, shouldFetch, key, post.accountId, post.postId]);

  const embed = resolveScarceEmbed(key, seed);

  const status: PostScarceEmbedStatus =
    seed != null
      ? 'ready'
      : errorKey === key
        ? 'error'
        : shouldFetch
          ? 'loading'
          : 'idle';

  return {
    rootRef,
    embed,
    status,
    retry: () => setRetryKey((value) => value + 1),
  };
}

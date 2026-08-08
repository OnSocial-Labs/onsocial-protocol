'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import {
  findLiveListingForPost,
  fetchScarceTokenMeta,
} from '@/features/market/market-listings';
import {
  fetchScarceAuctionView,
  minNextBidNear,
} from '@/features/scarces/scarce-auction';
import {
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  postScarceKey,
  reconcileScarceEmbedFromApi,
  resolveScarceEmbed,
  setScarceEmbedOverride,
  subscribeScarceEmbedLedger,
} from '@/features/scarces/scarce-embed-ledger';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export type PostScarceEmbedStatus = 'idle' | 'loading' | 'ready' | 'error';

const RECONCILE_RETRY_MS = [2_000, 5_000] as const;

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
 * Resolves post scarce CTAs. SSR / page seeds paint immediately; otherwise
 * lazy-loads when the card enters view (or `force` — author ⋮ menu).
 * Optimistic ledger overrides win until the indexer catches up.
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
  const [fetched, setFetched] = useState<PostScarceEmbed | null>(null);
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
    if (!shouldFetch) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const author = post.accountId;
    const postId = post.postId;
    void client.scarces.fromPost
      .embed({ author, postId })
      .then(async (embed) => {
        // Indexer events omit sourcePost for lazy listings, so embed often
        // returns `none` while Market still shows a live contract listing.
        let resolved = embed;
        if (!isActivelyListed(embed)) {
          const live = await findLiveListingForPost(author, author, postId);
          if (live?.listingId) {
            resolved = {
              ...embed,
              status: 'lazy_listing',
              listingId: live.listingId,
              priceNear: live.priceNear,
              ...(live.mediaUrl ? { mediaUrl: live.mediaUrl } : {}),
              ...(live.cardBg ? { cardBg: live.cardBg } : {}),
              ...(live.copies != null ? { copies: live.copies } : {}),
              ...(live.remaining != null ? { remaining: live.remaining } : {}),
            };
          }
        } else if (embed.status === 'lazy_listing') {
          // Refresh remaining from live state after multi-copy purchases.
          const live = await findLiveListingForPost(author, author, postId);
          if (live?.listingId) {
            resolved = {
              ...embed,
              listingId: live.listingId,
              priceNear: live.priceNear ?? embed.priceNear,
              ...(live.mediaUrl ? { mediaUrl: live.mediaUrl } : {}),
              ...(live.cardBg ? { cardBg: live.cardBg } : {}),
              ...(live.copies != null ? { copies: live.copies } : {}),
              ...(live.remaining != null ? { remaining: live.remaining } : {}),
            };
          }
        } else if (
          embed.status === 'listed' ||
          embed.status === 'auction' ||
          embed.status === 'sold' ||
          embed.status === 'minted'
        ) {
          if (embed.tokenId && !embed.mediaUrl) {
            const meta = await fetchScarceTokenMeta(embed.tokenId);
            if (meta) {
              resolved = {
                ...resolved,
                ...(meta.mediaUrl ? { mediaUrl: meta.mediaUrl } : {}),
                ...(meta.cardBg && !resolved.cardBg
                  ? { cardBg: meta.cardBg }
                  : {}),
              };
            }
          }
          if (embed.status === 'auction' && embed.tokenId) {
            const auction = await fetchScarceAuctionView(embed.tokenId);
            if (auction && !auction.isEnded) {
              resolved = {
                ...resolved,
                priceNear: minNextBidNear(auction),
              };
            }
          }
        }
        if (cancelled) return;
        reconcileScarceEmbedFromApi(key, resolved);
        setFetched(resolved);
        setFetchedKey(key);
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

  // If list succeeded but listingId wasn't in the relay payload, pull it from
  // live contract state so cancel / buy can proceed before the indexer lands.
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
      });
    });
    return () => {
      cancelled = true;
    };
  }, [override, shouldFetch, key, post.accountId, post.postId]);

  const baseline = fetchedKey === key && fetched != null ? fetched : seed;
  const embed = resolveScarceEmbed(key, baseline);

  const status: PostScarceEmbedStatus =
    fetchedKey === key || seed != null
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

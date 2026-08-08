'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { collectionCurrentRowToView } from '@/features/scarces/collections-data';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
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
import {
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
} from '@/lib/post-display';
import type { PostScarceEmbedStatus } from '@/features/scarces/use-post-scarce-embed';

const RECONCILE_RETRY_MS = [2_000, 5_000] as const;

function priceNearFromYocto(
  raw: string | null | undefined
): string | undefined {
  if (!raw?.trim() || !/^\d+$/.test(raw.trim())) return undefined;
  return yoctoToNear(raw.trim());
}

function paintToEmbed(
  collectionId: string,
  tokenId: string | undefined,
  paint: ReturnType<typeof parseDropPaintSnapshot>
): PostScarceEmbed {
  return {
    status: 'drop',
    collectionId,
    ...(tokenId ? { tokenId } : {}),
    ...(paint?.mediumKind ? { mediumKind: paint.mediumKind } : {}),
    ...(paint?.mediaUrl ? { mediaUrl: paint.mediaUrl } : {}),
    events: [],
  };
}

/**
 * Resolves durable `embeds[].kind === 'collection'` to a PostScarceEmbed
 * via live catalog (`collectionsCurrentByIds`). Sibling of
 * {@link usePostScarceEmbed} (fromPost / lazy) — do not run both when a
 * collection embed is present.
 */
export function usePostCollectionEmbed(
  post: PostRow,
  opts: { enabled?: boolean; force?: boolean } = {}
) {
  const parsed = parsePostCollectionEmbed(post.value);
  const enabled = opts.enabled !== false && Boolean(parsed);
  const force = Boolean(opts.force);
  const key = postScarceKey(post.accountId, post.postId);
  const rootRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [fetched, setFetched] = useState<PostScarceEmbed | null>(null);
  const [playables, setPlayables] = useState<ScarcePlayableMedia[]>([]);
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
    const collectionId = parsed.collectionId;
    const tokenId = parsed.tokenId;
    const paint = parseDropPaintSnapshot(post.value);

    void (async () => {
      try {
        const rows = await client.query.scarces.collectionsCurrentByIds([
          collectionId,
        ]);
        const row = rows[0] ?? null;
        let resolved: PostScarceEmbed = paintToEmbed(
          collectionId,
          tokenId,
          paint
        );

        if (row) {
          const view = collectionCurrentRowToView(row);
          const remaining =
            typeof row.remaining === 'number' && Number.isFinite(row.remaining)
              ? Math.max(0, Math.floor(row.remaining))
              : undefined;
          const copies =
            typeof row.totalSupply === 'number' &&
            Number.isFinite(row.totalSupply)
              ? Math.max(0, Math.floor(row.totalSupply))
              : undefined;
          const priceNear = priceNearFromYocto(row.price);
          const mediumKind =
            row.mediumKind?.trim().toLowerCase() ||
            view?.kind?.trim().toLowerCase() ||
            paint?.mediumKind ||
            undefined;
          const status: PostScarceEmbed['status'] =
            remaining === 0 || row.cancelled || row.banned
              ? 'sold'
              : row.paused
                ? 'minted'
                : 'drop';
          resolved = {
            status,
            collectionId,
            ...(row.creatorId?.trim()
              ? { creatorId: row.creatorId.trim() }
              : {}),
            ...(row.appId?.trim() ? { appId: row.appId.trim() } : {}),
            ...(view?.seriesId ? { seriesId: view.seriesId } : {}),
            ...(view?.seriesTitle ? { seriesTitle: view.seriesTitle } : {}),
            ...(mediumKind ? { mediumKind } : {}),
            ...(priceNear ? { priceNear } : {}),
            ...(copies != null ? { copies } : {}),
            ...(remaining != null ? { remaining } : {}),
            ...(view?.mediaUrl || paint?.mediaUrl
              ? { mediaUrl: view?.mediaUrl || paint?.mediaUrl }
              : {}),
            ...(tokenId ? { tokenId } : {}),
            events: [],
          };

          if (!cancelled) {
            setPlayables(view?.playables ?? []);
            setDropTitle(view?.title?.trim() || paint?.title || null);
          }
        } else if (!cancelled) {
          setPlayables([]);
          setDropTitle(paint?.title ?? null);
        }

        if (tokenId) {
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
              resolved = {
                ...resolved,
                status: 'listed',
                tokenId: hit.tokenId.trim(),
                ...(hit.listingId?.trim()
                  ? { listingId: hit.listingId.trim() }
                  : {}),
                ...(listPrice ? { priceNear: listPrice } : {}),
              };
            } else if (hit?.kind === 'auction' && hit.tokenId) {
              const listPrice = priceNearFromYocto(
                hit.highestBid ?? hit.reservePrice
              );
              resolved = {
                ...resolved,
                status: 'auction',
                tokenId: hit.tokenId.trim(),
                ...(listPrice ? { priceNear: listPrice } : {}),
              };
            }
          } catch {
            /* keep primary Drop state */
          }
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
    parsed?.collectionId,
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
      ? paintToEmbed(parsed.collectionId, parsed.tokenId, paint)
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
    playables,
    dropTitle,
    hasCollectionEmbed: Boolean(parsed),
    status,
    retry: () => setRetryKey((value) => value + 1),
  };
}

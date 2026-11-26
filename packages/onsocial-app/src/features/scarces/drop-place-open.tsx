'use client';

import {
  useCallback,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { isUnmodifiedPrimaryClick } from '@/features/home/post-thread-layer';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import { rememberCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import type { CollectionView } from '@/features/scarces/collections-data';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import {
  hasCollectionView,
  readCollectionView,
  rememberCollectionView,
} from '@/features/scarces/collection-view-cache';
import {
  collectionViewNeedsCatalogSoftFill,
  seedCollectionViewFromStoreDrop as seedStoreDropView,
} from '@/features/scarces/collection-page-view';
import { peekViewerAccountId } from '@/features/scarces/collection-page-view';
import { fetchOwnedCollectionTokenId } from '@/features/scarces/collections-data';
import { warmOwnedCollectionHold } from '@/features/scarces/owned-collection-hold-cache';
import { seedDropLoveFaceFromList } from '@/hooks/use-scarce-drop-loves';
import {
  collectionPath,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

type DropPlaceRouter = {
  push: (href: string, options?: { scroll?: boolean }) => void;
  prefetch: (href: string, options?: { kind?: 'auto' | 'full' }) => void;
};

/** Warm catalog on press when cache is cold — open resolve prefers the read. */
function warmCollectionView(collectionId: string): void {
  const id = collectionId.trim();
  if (!id || hasCollectionView(id)) return;
  void fetchCollectionPreferIndexer(id);
}

function prefetchDropPlace(router: DropPlaceRouter, href: string): void {
  try {
    router.prefetch(href, { kind: 'full' });
  } catch {
    /* prefetch is best-effort */
  }
}

/**
 * Same drop, same open — solid list view, else remembered catalog, else thin seed.
 * Reads cache without LRU bump; callers remember when opening.
 */
export function resolveDropOpenSeed(opts: {
  collectionId: string;
  initial?: CollectionView | null;
}): CollectionView | null {
  const id = opts.collectionId.trim();
  const initial = opts.initial ?? null;
  const listSolid =
    initial && !collectionViewNeedsCatalogSoftFill(initial) ? initial : null;
  if (listSolid) return listSolid;
  const cached = id ? readCollectionView(id) : null;
  return cached ?? initial;
}

/** Stash seed + creator so `/collection/…` loading paints frame 1 with dock. */
export function warmDropPlaceOpen(opts: {
  collectionId: string;
  initial?: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  /** List fan face — seeds love/fans so the drop face does not empty→fill. */
  fanCount?: number | null;
  fanIds?: string[] | null;
}): CollectionView | null {
  const id = opts.collectionId.trim();
  if (!id) return null;
  const seed = resolveDropOpenSeed({
    collectionId: id,
    initial: opts.initial,
  });
  if (seed) rememberCollectionView(seed);
  if (opts.initialCreator) {
    rememberCollectionCreatorFace(id, opts.initialCreator);
  }
  const creatorId =
    seed?.creatorId?.trim() ||
    opts.initial?.creatorId?.trim() ||
    '';
  if (creatorId && opts.fanCount != null && opts.fanCount > 0) {
    seedDropLoveFaceFromList({
      creatorId,
      collectionId: id,
      fanCount: opts.fanCount,
      fanIds: opts.fanIds,
    });
  }
  // Hold / Show pass / #edition — start before loading paints when possible.
  warmOwnedCollectionHold(
    peekViewerAccountId(),
    id,
    fetchOwnedCollectionTokenId
  );
  return seed;
}

export type DropPlaceOpenInput = {
  href: string;
  initial?: CollectionView | null;
  /** List/feed creator face when already painted — same as Drops. */
  initialCreator?: CollectionCreatorFace | null;
  fanCount?: number | null;
  fanIds?: string[] | null;
};

/** Soft-nav to the full drop place after seeding cache. */
export function navigateDropPlace(
  router: DropPlaceRouter,
  input: DropPlaceOpenInput
): boolean {
  const parsed = parseInAppDropLayerHref(input.href);
  if (!parsed) return false;
  warmDropPlaceOpen({
    collectionId: parsed.collectionId,
    initial: input.initial,
    initialCreator: input.initialCreator,
    fanCount: input.fanCount,
    fanIds: input.fanIds,
  });
  prefetchDropPlace(router, input.href);
  router.push(input.href, { scroll: false });
  return true;
}

/**
 * Soft-nav to the full drop place (dock Back + dock Mint).
 * Seeds the catalog cache first so route loading can paint hot.
 */
export function useDropPlaceOpen(): (input: DropPlaceOpenInput) => boolean {
  const router = useRouter();
  return useCallback(
    (input: DropPlaceOpenInput) =>
      navigateDropPlace(router as DropPlaceRouter, input),
    [router]
  );
}

/** Market / store card → place seed when a full view is not in hand. */
export function seedCollectionViewFromStoreDrop(
  drop: ProfileStoreDrop,
  creatorId?: string | null
): CollectionView | null {
  return seedStoreDropView(drop, creatorId);
}

type DropPlaceLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  href?: string;
  collectionId?: string;
  initial?: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  fanCount?: number | null;
  fanIds?: string[] | null;
  children?: ReactNode;
};

/**
 * In-app Drop open — soft-nav to the full drop place with warm seed.
 * Native `<a>` so modified clicks keep href; primary click seeds then navigates.
 */
export function DropPlaceLink({
  href,
  collectionId,
  initial = null,
  initialCreator = null,
  fanCount = null,
  fanIds = null,
  children,
  onClick,
  className,
  ...props
}: DropPlaceLinkProps) {
  const router = useRouter();
  const resolved =
    href?.trim() ||
    (collectionId?.trim() ? collectionPath(collectionId.trim()) : '');
  if (!resolved) return null;
  const collectionIdForWarm =
    collectionId?.trim() ||
    parseInAppDropLayerHref(resolved)?.collectionId ||
    '';
  return (
    <a
      href={resolved}
      className={className}
      {...props}
      onPointerDown={() => {
        if (collectionIdForWarm) {
          warmCollectionView(collectionIdForWarm);
          warmDropPlaceOpen({
            collectionId: collectionIdForWarm,
            initial,
            initialCreator,
            fanCount,
            fanIds,
          });
        }
        prefetchDropPlace(router as DropPlaceRouter, resolved);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!parseInAppDropLayerHref(resolved)) return;
        event.preventDefault();
        event.stopPropagation();
        navigateDropPlace(router as DropPlaceRouter, {
          href: resolved,
          initial,
          initialCreator,
          fanCount,
          fanIds,
        });
      }}
    >
      {children}
    </a>
  );
}

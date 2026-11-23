'use client';

import {
  useCallback,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
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
  return seed;
}

export type DropPlaceOpenInput = {
  href: string;
  initial?: CollectionView | null;
  /** List/feed creator face when already painted — same as Drops. */
  initialCreator?: CollectionCreatorFace | null;
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

/**
 * Appear-over drop (header chevron) — Discover Just sold and similar.
 * Catalog opens use DropPlaceLink / useDropPlaceOpen.
 */
export function useDropAppearOpen(): (
  input: DropPlaceOpenInput
) => boolean {
  const { openDrop } = usePostThreadLayer();
  return useCallback(
    (input: DropPlaceOpenInput) => {
      const parsed = parseInAppDropLayerHref(input.href);
      if (!parsed) return false;
      const seed = resolveDropOpenSeed({
        collectionId: parsed.collectionId,
        initial: input.initial,
      });
      if (seed) rememberCollectionView(seed);
      if (input.initialCreator) {
        rememberCollectionCreatorFace(
          parsed.collectionId,
          input.initialCreator
        );
      }
      return openDrop({
        ...input,
        initial: seed,
      });
    },
    [openDrop]
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
        if (collectionIdForWarm) warmCollectionView(collectionIdForWarm);
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
        });
      }}
    >
      {children}
    </a>
  );
}

/** Appear-over drop link — Discover Just sold and similar. */
export function DropAppearLink({
  href,
  collectionId,
  initial = null,
  initialCreator = null,
  children,
  onClick,
  className,
  ...props
}: DropPlaceLinkProps) {
  const openAppear = useDropAppearOpen();
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
        if (collectionIdForWarm) warmCollectionView(collectionIdForWarm);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!parseInAppDropLayerHref(resolved)) return;
        event.preventDefault();
        event.stopPropagation();
        openAppear({
          href: resolved,
          initial,
          initialCreator,
        });
      }}
    >
      {children}
    </a>
  );
}

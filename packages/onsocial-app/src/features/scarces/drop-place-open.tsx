'use client';

import {
  useCallback,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { warmDropPanel } from '@/lib/thread-first-page';
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
import { collectionPath, parseInAppDropLayerHref } from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Warm catalog on press when cache is cold — open resolve prefers the read. */
function warmCollectionView(collectionId: string): void {
  const id = collectionId.trim();
  if (!id || hasCollectionView(id)) return;
  void fetchCollectionPreferIndexer(id);
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

/** Stash seed + creator so the sheet (and a hard load) paints frame 1. */
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
    seed?.creatorId?.trim() || opts.initial?.creatorId?.trim() || '';
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

type DropSheetOpen = (input: {
  href: string;
  initial?: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
}) => boolean;

/**
 * One in-app drop open: seed from the card, then the shared sheet.
 * The full `/collection/…` page stays for refresh, share, and hard loads.
 */
export function navigateDropPlace(
  openDrop: DropSheetOpen,
  input: DropPlaceOpenInput
): boolean {
  const parsed = parseInAppDropLayerHref(input.href);
  if (!parsed) return false;
  const seed = warmDropPlaceOpen({
    collectionId: parsed.collectionId,
    initial: input.initial,
    initialCreator: input.initialCreator,
    fanCount: input.fanCount,
    fanIds: input.fanIds,
  });
  return openDrop({
    href: input.href,
    initial: seed ?? input.initial ?? null,
    initialCreator: input.initialCreator ?? null,
  });
}

/**
 * Open the shared drop sheet (dock Back + dock Mint) over the current page.
 * Seeds the catalog cache first so the sheet paints from the card.
 */
export function useDropPlaceOpen(): (input: DropPlaceOpenInput) => boolean {
  const { openDrop } = usePostThreadLayer();
  return useCallback(
    (input: DropPlaceOpenInput) => navigateDropPlace(openDrop, input),
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
  fanCount?: number | null;
  fanIds?: string[] | null;
  children?: ReactNode;
};

/**
 * In-app Drop open — shared sheet over the current page.
 * Native `<a>` so modified clicks keep href; primary click seeds then opens.
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
  const openPlace = useDropPlaceOpen();
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
        warmDropPanel();
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
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!parseInAppDropLayerHref(resolved)) return;
        event.preventDefault();
        event.stopPropagation();
        openPlace({
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

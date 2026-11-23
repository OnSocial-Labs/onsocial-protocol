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
import type { CollectionView } from '@/features/scarces/collections-data';
import { seedCollectionViewFromStoreDrop as seedStoreDropView } from '@/features/scarces/collection-page-view';
import {
  collectionPath,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Open a drop overlay; optional seed paints cover/title before fetch. */
export function useDropOverlayOpen(): (input: {
  href: string;
  initial?: CollectionView | null;
}) => boolean {
  const { openDrop } = usePostThreadLayer();
  return useCallback(
    (input: { href: string; initial?: CollectionView | null }) => {
      if (!parseInAppDropLayerHref(input.href)) return false;
      return openDrop(input);
    },
    [openDrop]
  );
}

/** Market / store card → overlay seed when a full view is not in hand. */
export function seedCollectionViewFromStoreDrop(
  drop: ProfileStoreDrop,
  creatorId?: string | null
): CollectionView | null {
  return seedStoreDropView(drop, creatorId);
}

type DropOverlayLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  href?: string;
  collectionId?: string;
  initial?: CollectionView | null;
  children?: ReactNode;
};

/**
 * In-app Drop open — same overlay as Drops / Just sold / Market.
 * Native `<a>` (not Next Link) so App Router never soft-navs to the cold
 * `/collection/…` route and its loading skeleton. Modified clicks still use href.
 */
export function DropOverlayLink({
  href,
  collectionId,
  initial = null,
  children,
  onClick,
  className,
  ...props
}: DropOverlayLinkProps) {
  const resolved =
    href?.trim() ||
    (collectionId?.trim() ? collectionPath(collectionId.trim()) : '');
  const openDrop = useDropOverlayOpen();
  if (!resolved) return null;
  return (
    <a
      href={resolved}
      className={className}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!isUnmodifiedPrimaryClick(event)) return;
        if (!parseInAppDropLayerHref(resolved)) return;
        event.preventDefault();
        event.stopPropagation();
        openDrop({ href: resolved, initial });
      }}
    >
      {children}
    </a>
  );
}

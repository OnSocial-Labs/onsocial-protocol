'use client';

import { useCallback, type MouseEvent } from 'react';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import type { CollectionView } from '@/features/scarces/collections-data';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { parseInAppDropLayerHref } from '@/lib/app-routes';
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

export function dropOverlayLinkHandlers(
  href: string,
  open: (input: {
    href: string;
    initial?: CollectionView | null;
  }) => boolean,
  initial?: CollectionView | null
): {
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onNavigate: (event: { preventDefault: () => void }) => void;
} {
  return {
    onClick(event) {
      if (!isUnmodifiedPrimaryClick(event)) return;
      if (!open({ href, initial })) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onNavigate(event) {
      if (!open({ href, initial })) return;
      event.preventDefault();
    },
  };
}

/** Market / store card → overlay seed when a full view is not in hand. */
export function seedCollectionViewFromStoreDrop(
  drop: ProfileStoreDrop
): CollectionView | null {
  return seedCollectionViewFromPeek({
    collectionId: drop.collectionId,
    title: drop.title,
    coverUrl: drop.mediaUrl,
    creatorId: null,
    kind: drop.mediumKind ?? null,
    audioFormat: drop.audioFormat ?? null,
  });
}

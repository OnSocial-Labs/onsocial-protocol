'use client';

import { useEffect, useRef, useState } from 'react';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import {
  loadPostLikeAccountIds,
  mergeViewerIntoLikeAccountIds,
  peekPostLikeAccountIds,
} from '@/lib/load-post-like-account-ids';
import { SHEET_Z } from '@/lib/sheet-z';

export type PostLikesSheetProps = {
  open: boolean;
  onClose: () => void;
  postOwner: string;
  postId: string;
  groupId?: string | null;
  likeCount: number;
  /** Article / post title under the sheet label. */
  title?: string | null;
  viewerAccountId?: string | null;
  viewerLiked?: boolean;
  /** Over a reader shell (feed article / Writing). Default clears listen. */
  zIndex?: number;
};

function seedLikerIds(input: {
  postOwner: string;
  postId: string;
  groupId?: string | null;
  likeCount: number;
  viewerAccountId?: string | null;
  viewerLiked?: boolean;
}): string[] {
  const peeked = peekPostLikeAccountIds(input.postOwner, input.postId, {
    groupId: input.groupId,
    likeCount: input.likeCount,
  });
  if (!peeked) return [];
  return mergeViewerIntoLikeAccountIds(
    peeked,
    input.viewerAccountId,
    Boolean(input.viewerLiked)
  );
}

/**
 * Who liked a post — the same person row as album fans.
 * Keeps the last good list across closes (boost-style) and paints warm
 * pointerdown reads immediately on open.
 */
export function PostLikesSheet({
  open,
  onClose,
  postOwner,
  postId,
  groupId = null,
  likeCount,
  title = null,
  viewerAccountId = null,
  viewerLiked = false,
  zIndex = SHEET_Z.overShell,
}: PostLikesSheetProps) {
  const [likerIds, setLikerIds] = useState(() =>
    seedLikerIds({
      postOwner,
      postId,
      groupId,
      likeCount,
      viewerAccountId,
      viewerLiked,
    })
  );
  const [idsLoading, setIdsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const likerIdsRef = useRef(likerIds);

  useEffect(() => {
    likerIdsRef.current = likerIds;
  }, [likerIds]);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const seeded = seedLikerIds({
        postOwner,
        postId,
        groupId,
        likeCount,
        viewerAccountId,
        viewerLiked,
      });
      if (seeded.length > 0) {
        setLikerIds(seeded);
        setIdsLoading(false);
      } else if (likerIds.length === 0) {
        setIdsLoading(true);
      }
      setLoadFailed(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void loadPostLikeAccountIds(postOwner, postId, {
      groupId,
      likeCount,
    })
      .then((ids) => {
        if (cancelled) return;
        setLikerIds(
          mergeViewerIntoLikeAccountIds(ids, viewerAccountId, viewerLiked)
        );
        setLoadFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep last-good paint on soft failure (boost position style).
        if (likerIdsRef.current.length > 0) return;
        setLikerIds(
          mergeViewerIntoLikeAccountIds([], viewerAccountId, viewerLiked)
        );
        setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIdsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    postOwner,
    postId,
    groupId,
    likeCount,
    viewerAccountId,
    viewerLiked,
  ]);

  return (
    <ScarceFansSheet
      open={open}
      onClose={onClose}
      fanIds={likerIds}
      fanCount={likeCount}
      dropTitle={title}
      idsLoading={idsLoading}
      label="Likes"
      countSingular="like"
      countPlural="likes"
      emptyCopy={loadFailed ? 'Couldn’t load likes.' : 'No likes yet.'}
      errorCopy="Couldn’t load likes."
      closeAriaLabel="Close likes"
      backdropLabel="Close likes"
      zIndex={zIndex}
    />
  );
}

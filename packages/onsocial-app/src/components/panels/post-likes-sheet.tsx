'use client';

import { useEffect, useState } from 'react';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import {
  loadPostLikeAccountIds,
  mergeViewerIntoLikeAccountIds,
} from '@/lib/load-post-like-account-ids';

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
};

/**
 * Who liked a post — same standing roster chrome as album fans.
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
}: PostLikesSheetProps) {
  const [likerIds, setLikerIds] = useState<string[]>([]);
  const [idsLoading, setIdsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setLikerIds([]);
      setIdsLoading(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    setIdsLoading(true);
    setLoadFailed(false);

    void loadPostLikeAccountIds(postOwner, postId, { groupId })
      .then((ids) => {
        if (cancelled) return;
        setLikerIds(
          mergeViewerIntoLikeAccountIds(ids, viewerAccountId, viewerLiked)
        );
        setLoadFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
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
    />
  );
}

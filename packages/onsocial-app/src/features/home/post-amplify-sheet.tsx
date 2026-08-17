'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import { OsGestureSheet } from '@onsocial/ui';
import {
  PostAmplifyForm,
  type PostAmplifySuccessDetail,
} from '@/features/home/post-amplify-form';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface PostAmplifySheetProps {
  open: boolean;
  post: PostRow | null;
  authorName?: string | null;
  onOpenChange: (open: boolean) => void;
  onAmplified?: (post: PostRow, detail: PostAmplifySuccessDetail) => void;
}

/** Money sheet for post Amplify — same family as profile Support. */
export function PostAmplifySheet({
  open,
  post,
  authorName = null,
  onOpenChange,
  onAmplified,
}: PostAmplifySheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing && post != null;
  const name = post ? displayName(post.accountId, authorName ?? undefined) : '';
  const handle = post ? fallbackLabel(post.accountId) : '';
  const authorMood = usePageOwnerMood(
    post?.accountId,
    Boolean(open || closing)
  );
  const panelStyle = useMemo(
    () =>
      authorMood
        ? (supportSheetPanelStyle(authorMood.cssVars) as CSSProperties)
        : undefined,
    [authorMood]
  );

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb="Amplify"
      personName={name}
      handle={handle}
      signal="reputation"
      whisper="DAO sets the SOCIAL split on-chain."
      closeAriaLabel="Close amplify"
      backdropLabel="Close amplify"
      moodId={authorMood?.id}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={56}
    >
      {post ? (
        <PostAmplifyForm
          key={`${formKey}:${post.accountId}:${post.postId}`}
          post={post}
          authorName={authorName}
          onSuccess={(detail) => {
            onAmplified?.(post, detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}

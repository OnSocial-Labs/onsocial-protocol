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
import { amplifyWorkTitle } from '@/lib/post-display';
import { SHEET_Z } from '@/lib/sheet-z';

interface PostAmplifySheetProps {
  open: boolean;
  post: PostRow | null;
  authorName?: string | null;
  /** Hydrated drop / book title when the post body has no work name. */
  workTitle?: string | null;
  onOpenChange: (open: boolean) => void;
  onAmplified?: (post: PostRow, detail: PostAmplifySuccessDetail) => void;
  zIndex?: number;
}

/** Money sheet for post Amplify — same family as profile Support. */
export function PostAmplifySheet({
  open,
  post,
  authorName = null,
  workTitle = null,
  onOpenChange,
  onAmplified,
  zIndex = SHEET_Z.overShell,
}: PostAmplifySheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing && post != null;
  const subject = post ? amplifyWorkTitle(post.value, workTitle) : '';
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
      {...(subject ? { subject } : {})}
      signal="reputation"
      closeAriaLabel="Close amplify"
      backdropLabel="Close amplify"
      moodId={authorMood?.id}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={zIndex}
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

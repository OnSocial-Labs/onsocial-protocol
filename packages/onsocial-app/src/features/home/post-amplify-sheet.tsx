'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import { PostAmplifyForm } from '@/features/home/post-amplify-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface PostAmplifySheetProps {
  open: boolean;
  post: PostRow | null;
  authorName?: string | null;
  onOpenChange: (open: boolean) => void;
  onAmplified?: (post: PostRow) => void;
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
  const name = post
    ? displayName(post.accountId, authorName ?? undefined)
    : '';
  const handle = post ? fallbackLabel(post.accountId) : '';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      panelClassName="profile-support-sheet-panel"
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close amplify"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Amplify"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close amplify"
            onClose={requestClose}
            whisper="DAO sets the SOCIAL split on-chain."
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {post ? (
        <PostAmplifyForm
          key={`${formKey}:${post.accountId}:${post.postId}`}
          post={post}
          authorName={authorName}
          onSuccess={() => {
            onAmplified?.(post);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

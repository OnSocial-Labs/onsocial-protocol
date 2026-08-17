'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { OsGestureSheet } from '@onsocial/ui';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceListForm,
  type ScarceListSuccessDetail,
} from '@/features/scarces/scarce-list-form';
import { scarceNestZIndex } from '@/features/scarces/scarce-overlay-z';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface ScarceListSheetProps {
  open: boolean;
  post: PostRow | null;
  authorName?: string | null;
  onOpenChange: (open: boolean) => void;
  onListed?: (post: PostRow, detail: ScarceListSuccessDetail) => void;
  /** Stack above feed enlarge lightbox (z-index 80) when opened from player shell. */
  zIndex?: number;
}

/** Author sheet: lazy-list a post as a scarce (mint-on-purchase). */
export function ScarceListSheet({
  open,
  post,
  authorName = null,
  onOpenChange,
  onListed,
  zIndex = 56,
}: ScarceListSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sheetOpen = open && !closing && post != null;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  const name = post ? displayName(post.accountId, authorName ?? undefined) : '';
  const handle = post ? fallbackLabel(post.accountId) : '';

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

  const handleFooterStateChange = useCallback(
    (state: CommerceSheetFooterState | null) => {
      setFooterState((prev) =>
        commerceFooterStatesEqual(prev, state) ? prev : state
      );
    },
    []
  );

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb="List"
      personName={name}
      handle={handle}
      signal="reputation"
      closeAriaLabel="Close list scarce"
      backdropLabel="Close list scarce"
      keyboardOpen={keyboardOpen}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={zIndex}
      footer={
        footerState?.visible ? (
          <CommerceSheetFooter
            formId={formId}
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      {post ? (
        <ScarceListForm
          key={`${formKey}:${post.accountId}:${post.postId}`}
          formId={formId}
          post={post}
          authorName={authorName}
          nestZIndex={scarceNestZIndex(zIndex)}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onListed?.(post, detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}

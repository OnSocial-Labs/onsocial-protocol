'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceBuyForm,
  type ScarceBuySuccessDetail,
} from '@/features/scarces/scarce-buy-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export interface ScarceBuyListing {
  listingId?: string;
  tokenId?: string;
  status: PostScarceEmbed['status'];
  priceNear?: string;
  title?: string;
  mediaUrl?: string | null;
  creatorId: string;
  creatorName?: string | null;
  copies?: number;
  remaining?: number;
}

interface ScarceBuySheetProps {
  open: boolean;
  post?: PostRow | null;
  authorName?: string | null;
  embed?: PostScarceEmbed | null;
  listing?: ScarceBuyListing | null;
  onOpenChange: (open: boolean) => void;
  onPurchased?: (detail: ScarceBuySuccessDetail) => void;
  onMakeOffer?: () => void;
}

/** Buyer sheet for lazy listing / fixed-price scarce purchase. */
export function ScarceBuySheet({
  open,
  post = null,
  authorName = null,
  embed = null,
  listing = null,
  onOpenChange,
  onPurchased,
  onMakeOffer,
}: ScarceBuySheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const creatorId = listing?.creatorId ?? post?.accountId ?? '';
  const sheetOpen =
    open && !closing && (post != null || listing != null) && Boolean(creatorId);
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  const name = creatorId
    ? displayName(
        creatorId,
        listing?.creatorName ?? authorName ?? undefined
      )
    : '';
  const handle = creatorId ? fallbackLabel(creatorId) : '';

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

  const handleFooterStateChange = useCallback(
    (state: CommerceSheetFooterState | null) => {
      setFooterState(state);
    },
    []
  );

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      initialDetent="full"
      panelClassName={`profile-support-sheet-panel${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
      panelStyle={panelStyle}
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close buy scarce"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Buy"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close buy scarce"
            onClose={requestClose}
            whisper="Collect this scarce with NEAR."
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
      {sheetOpen ? (
        <ScarceBuyForm
          key={`${formKey}:${listing?.listingId ?? ''}:${post?.postId ?? ''}`}
          formId={formId}
          post={post}
          authorName={listing?.creatorName ?? authorName}
          listing={
            listing
              ? {
                  listingId: listing.listingId,
                  tokenId: listing.tokenId,
                  status: listing.status,
                  priceNear: listing.priceNear,
                  title: listing.title,
                  mediaUrl: listing.mediaUrl,
                  creatorId: listing.creatorId,
                  copies: listing.copies,
                  remaining: listing.remaining,
                }
              : null
          }
          embed={embed}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onPurchased?.(detail);
            requestClose();
          }}
          onMakeOffer={
            onMakeOffer
              ? () => {
                  onMakeOffer();
                  requestClose();
                }
              : undefined
          }
        />
      ) : null}
    </GlassSheet>
  );
}

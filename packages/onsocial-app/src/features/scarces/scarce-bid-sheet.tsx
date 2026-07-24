'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceBidForm,
  type ScarceBidSuccessDetail,
} from '@/features/scarces/scarce-bid-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export interface ScarceBidListing {
  tokenId: string;
  title?: string;
  /** NEP-177 description — full post text when minted from a post. */
  description?: string;
  mediaUrl?: string | null;
  sellerId: string;
  sellerName?: string | null;
  priceNear?: string;
  sourcePostPath?: string;
  postHref?: string | null;
  /** Clip behind a video scarce — cover stays the still frame. */
  playable?: ScarcePlayableMedia;
}

interface ScarceBidSheetProps {
  open: boolean;
  post?: PostRow | null;
  authorName?: string | null;
  embed?: PostScarceEmbed | null;
  listing?: ScarceBidListing | null;
  onOpenChange: (open: boolean) => void;
  onBid?: (detail: ScarceBidSuccessDetail) => void;
}

/** Buyer sheet for placing a bid on a native scarce auction. */
export function ScarceBidSheet({
  open,
  post = null,
  authorName = null,
  embed = null,
  listing = null,
  onOpenChange,
  onBid,
}: ScarceBidSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sellerId = listing?.sellerId ?? post?.accountId ?? '';
  const sheetOpen =
    open &&
    !closing &&
    (post != null || listing != null) &&
    Boolean(sellerId) &&
    Boolean(listing?.tokenId ?? embed?.tokenId);
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  const name = sellerId
    ? displayName(sellerId, listing?.sellerName ?? authorName ?? undefined)
    : '';
  const handle = sellerId ? fallbackLabel(sellerId) : '';

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
      backdropLabel="Close bid scarce"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Bid"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close bid scarce"
            onClose={requestClose}
            whisper="Bid, buy now if listed, or settle when time’s up."
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
        <ScarceBidForm
          key={`${formKey}:${listing?.tokenId ?? ''}:${post?.postId ?? ''}`}
          formId={formId}
          post={post}
          authorName={listing?.sellerName ?? authorName}
          listing={
            listing
              ? {
                  tokenId: listing.tokenId,
                  title: listing.title,
                  mediaUrl: listing.mediaUrl,
                  sellerId: listing.sellerId,
                  priceNear: listing.priceNear,
                }
              : null
          }
          embed={embed}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onBid?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

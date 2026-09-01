'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { OsGestureSheet, osGestureSheetPanelCommerceClassName } from '@onsocial/ui';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceBidForm,
  type ScarceBidSuccessDetail,
} from '@/features/scarces/scarce-bid-form';

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
  /** Catalog listed time (ms) — shown as “Listed …” on the bid sheet. */
  listedAtMs?: number;
  /** Clip behind a video scarce — cover stays the still frame. */
  playable?: ScarcePlayableMedia;
  /** Album / multi-track playables; `playable` is the first. */
  playables?: ScarcePlayableMedia[];
}

interface ScarceBidSheetProps {
  open: boolean;
  post?: PostRow | null;
  authorName?: string | null;
  embed?: PostScarceEmbed | null;
  listing?: ScarceBidListing | null;
  onOpenChange: (open: boolean) => void;
  onBid?: (detail: ScarceBidSuccessDetail) => void;
  /** Stack above portfolio drawers when opened from Listings. */
  zIndex?: number;
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
  zIndex = 56,
}: ScarceBidSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sellerId =
    listing?.sellerId ?? embed?.creatorId ?? post?.accountId ?? '';
  const sheetOpen =
    open &&
    !closing &&
    (post != null || listing != null || embed != null) &&
    Boolean(sellerId) &&
    Boolean(listing?.tokenId ?? embed?.tokenId);
  const { panelStyle, keyboardOpen, moodId } =
    useCommerceSheetKeyboard(sheetOpen);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setFormKey((key) => key + 1);
    }
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
      verb="Bid"
      signal="reputation"
      closeAriaLabel="Close bid scarce"
      backdropLabel="Close bid scarce"
      keyboardOpen={keyboardOpen}
      moodId={moodId}
      panelStyle={panelStyle}
      panelClassName={osGestureSheetPanelCommerceClassName}
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
      {sheetOpen ? (
        <ScarceBidForm
          key={`${formKey}:${listing?.tokenId ?? ''}:${post?.postId ?? ''}`}
          formId={formId}
          post={post}
          authorName={listing?.sellerName ?? authorName}
          listing={listing}
          embed={embed}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onBid?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}
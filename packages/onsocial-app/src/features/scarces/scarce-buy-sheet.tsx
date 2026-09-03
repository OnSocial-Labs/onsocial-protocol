'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { OsGestureSheet } from '@onsocial/ui';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceBuyForm,
  type ScarceBuySuccessDetail,
} from '@/features/scarces/scarce-buy-form';
import { isPrimaryMintStatus } from '@/features/scarces/post-drop-cta';

export interface ScarceBuyListing {
  listingId?: string;
  tokenId?: string;
  collectionId?: string;
  status: PostScarceEmbed['status'];
  priceNear?: string;
  title?: string;
  /** NEP-177 description — full post text when minted from a post. */
  description?: string;
  mediaUrl?: string | null;
  creatorId: string;
  /**
   * Original mint creator when this is a resale and they differ from
   * `creatorId` (the seller). Same as Market listing `artistId`.
   */
  artistId?: string;
  creatorName?: string | null;
  cardBg?: string;
  copies?: number;
  remaining?: number;
  sourcePostPath?: string;
  postHref?: string | null;
  /** Catalog listed time (ms) — shown as “Listed …” on the buy sheet. */
  listedAtMs?: number;
  /** Known viewer offer — Buy paints Update offer on first paint. */
  viewerOfferNear?: string | null;
  /** Clip behind a video scarce — cover stays the still frame. */
  playable?: ScarcePlayableMedia;
  /** Album / multi-track playables; `playable` is the first. */
  playables?: ScarcePlayableMedia[];
  /** Viewer already owns an edition — CTA becomes Buy/Mint another. */
  alreadyOwnsEdition?: boolean;
  /**
   * Max mint qty for this wallet (supply / wallet / allowlist caps).
   * Stepper shows when > 1 on Drop primary mint.
   */
  maxQuantity?: number;
}

interface ScarceBuySheetProps {
  open: boolean;
  post?: PostRow | null;
  authorName?: string | null;
  embed?: PostScarceEmbed | null;
  listing?: ScarceBuyListing | null;
  /** Viewer already owns an edition — Mint/Buy another. */
  alreadyOwnsEdition?: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased?: (detail: ScarceBuySuccessDetail) => void;
  onMakeOffer?: (detail?: { amountNear?: string | null }) => void;
  /** Stack above feed enlarge lightbox (z-index 80) when opened from player shell. */
  zIndex?: number;
}

/** Buyer sheet for Drop mint / lazy listing / fixed-price purchase. */
export function ScarceBuySheet({
  open,
  post = null,
  authorName = null,
  embed = null,
  listing = null,
  alreadyOwnsEdition = false,
  onOpenChange,
  onPurchased,
  onMakeOffer,
  zIndex = 56,
}: ScarceBuySheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sellerId =
    listing?.creatorId ?? embed?.creatorId ?? post?.accountId ?? '';
  const sheetOpen =
    open &&
    !closing &&
    (post != null || listing != null || embed != null) &&
    Boolean(sellerId);
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

  const formListing = useMemo(() => {
    if (!listing) return null;
    const owns = listing.alreadyOwnsEdition || alreadyOwnsEdition;
    return owns === listing.alreadyOwnsEdition
      ? listing
      : { ...listing, alreadyOwnsEdition: owns };
  }, [listing, alreadyOwnsEdition]);

  const handleSuccess = useCallback(
    (detail: ScarceBuySuccessDetail) => {
      onPurchased?.(detail);
      requestClose();
    },
    [onPurchased, requestClose]
  );

  const handleMakeOffer = useCallback(
    (detail?: { amountNear?: string | null }) => {
      onMakeOffer?.(detail);
    },
    [onMakeOffer]
  );

  const commerceStatus = listing?.status ?? embed?.status;
  const isMint = isPrimaryMintStatus(commerceStatus);
  const closeLabel = isMint ? 'Close mint scarce' : 'Close buy scarce';

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb={isMint ? 'Mint' : 'Buy'}
      signal="reputation"
      closeAriaLabel={closeLabel}
      backdropLabel={closeLabel}
      keyboardOpen={keyboardOpen}
      moodId={moodId}
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
      {sheetOpen ? (
        <ScarceBuyForm
          key={`${formKey}:${listing?.listingId ?? ''}:${post?.postId ?? ''}`}
          formId={formId}
          post={post}
          authorName={listing?.creatorName ?? authorName}
          listing={formListing}
          embed={embed}
          alreadyOwnsEdition={alreadyOwnsEdition}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={handleSuccess}
          onMakeOffer={onMakeOffer ? handleMakeOffer : undefined}
        />
      ) : null}
    </OsGestureSheet>
  );
}

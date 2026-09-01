'use client';

import { useCallback, useId, useState } from 'react';
import { OsGestureSheet } from '@onsocial/ui';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceOfferForm,
  type ScarceOfferSuccessDetail,
} from '@/features/scarces/scarce-offer-form';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

export interface ScarceOfferListing {
  tokenId: string;
  title?: string;
  mediaUrl?: string | null;
  ownerId: string;
  ownerName?: string | null;
  askNear?: string;
}

interface ScarceOfferSheetProps {
  open: boolean;
  listing: ScarceOfferListing | null;
  onOpenChange: (open: boolean) => void;
  onOffered?: (detail: ScarceOfferSuccessDetail) => void;
}

/** Sheet for making a NEAR offer on a native scarce. */
export function ScarceOfferSheet({
  open,
  listing,
  onOpenChange,
  onOffered,
}: ScarceOfferSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const ownerId = listing?.ownerId ?? '';
  const sheetOpen = open && !closing && listing != null && Boolean(ownerId);
  const { panelStyle, keyboardOpen, moodId } =
    useCommerceSheetKeyboard(sheetOpen);
  const name = ownerId
    ? displayName(ownerId, listing?.ownerName ?? undefined)
    : '';
  const handle = ownerId ? fallbackLabel(ownerId) : '';

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
      verb="Offer"
      personName={name}
      handle={handle}
      signal="reputation"
      whisper="Offer NEAR for this scarce. Owner accepts when ready."
      closeAriaLabel="Close offer scarce"
      backdropLabel="Close offer scarce"
      keyboardOpen={keyboardOpen}
      moodId={moodId}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={SHEET_Z.gesture}
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
      {sheetOpen && listing ? (
        <ScarceOfferForm
          key={`${formKey}:${listing.tokenId}`}
          formId={formId}
          listing={{
            tokenId: listing.tokenId,
            title: listing.title,
            mediaUrl: listing.mediaUrl,
            ownerId: listing.ownerId,
            askNear: listing.askNear,
          }}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onOffered?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}

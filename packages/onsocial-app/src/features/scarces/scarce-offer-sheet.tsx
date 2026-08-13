'use client';

import { useCallback, useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';

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
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  const name = ownerId
    ? displayName(ownerId, listing?.ownerName ?? undefined)
    : '';
  const handle = ownerId ? fallbackLabel(ownerId) : '';

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
      setFooterState((prev) =>
        commerceFooterStatesEqual(prev, state) ? prev : state
      );
    },
    []
  );

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      sizing="hug"
      initialDetent="full"
      peekRatio={1}
      panelClassName={`profile-support-sheet-panel${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
      panelStyle={panelStyle}
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close offer scarce"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Offer"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close offer scarce"
            onClose={requestClose}
            whisper="Offer NEAR for this scarce. Owner accepts when ready."
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
    </GlassSheet>
  );
}

'use client';

import { useCallback, useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
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
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const ownerId = listing?.ownerId ?? '';
  const sheetOpen = open && !closing && listing != null && Boolean(ownerId);
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

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      panelClassName="profile-support-sheet-panel"
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
    >
      {sheetOpen && listing ? (
        <ScarceOfferForm
          key={`${formKey}:${listing.tokenId}`}
          listing={{
            tokenId: listing.tokenId,
            title: listing.title,
            mediaUrl: listing.mediaUrl,
            ownerId: listing.ownerId,
            askNear: listing.askNear,
          }}
          onSuccess={(detail) => {
            onOffered?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

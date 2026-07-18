'use client';

import { useCallback, useId, useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
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
}

interface ScarceBuySheetProps {
  open: boolean;
  post?: PostRow | null;
  authorName?: string | null;
  embed?: PostScarceEmbed | null;
  listing?: ScarceBuyListing | null;
  onOpenChange: (open: boolean) => void;
  onPurchased?: (detail: ScarceBuySuccessDetail) => void;
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
}: ScarceBuySheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const creatorId = listing?.creatorId ?? post?.accountId ?? '';
  const sheetOpen =
    open && !closing && (post != null || listing != null) && Boolean(creatorId);
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

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      panelClassName="profile-support-sheet-panel"
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
    >
      {sheetOpen ? (
        <ScarceBuyForm
          key={`${formKey}:${listing?.listingId ?? ''}:${post?.postId ?? ''}`}
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
                }
              : null
          }
          embed={embed}
          onSuccess={(detail) => {
            onPurchased?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

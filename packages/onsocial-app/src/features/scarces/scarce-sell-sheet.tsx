'use client';

import { useCallback, useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  ScarceSellForm,
  type ScarceSellSuccessDetail,
} from '@/features/scarces/scarce-sell-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface ScarceSellSheetProps {
  open: boolean;
  item: OwnedScarceItem | null;
  sellerAccountId?: string | null;
  onOpenChange: (open: boolean) => void;
  onListed?: (detail: ScarceSellSuccessDetail) => void;
}

/** Owner sheet: list an owned scarce for secondary sale. */
export function ScarceSellSheet({
  open,
  item,
  sellerAccountId = null,
  onOpenChange,
  onListed,
}: ScarceSellSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing && item != null;
  const accountId = sellerAccountId?.trim() || item?.ownerId || '';
  const name = accountId ? displayName(accountId) : '';
  const handle = accountId ? fallbackLabel(accountId) : '';

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
      backdropLabel="Close sell scarce"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Sell"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close sell scarce"
            onClose={requestClose}
            whisper="List your scarce for resale."
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {item ? (
        <ScarceSellForm
          key={`${formKey}:${item.tokenId}`}
          item={item}
          onSuccess={(detail) => {
            onListed?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

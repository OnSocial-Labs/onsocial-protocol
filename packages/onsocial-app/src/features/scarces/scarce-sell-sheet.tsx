'use client';

import { useCallback, useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceSellForm,
  type ScarceSellSuccessDetail,
} from '@/features/scarces/scarce-sell-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';

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
  onOpenChange,
  onListed,
}: ScarceSellSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sheetOpen = open && !closing && item != null;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);

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
      peekRatio={1}
      panelClassName={`profile-support-sheet-panel${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
      panelStyle={panelStyle}
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close sell scarce"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Sell"
            signal="reputation"
            closeAriaLabel="Close sell scarce"
            onClose={requestClose}
            whisper="List fixed-price or start an auction."
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
      {item ? (
        <ScarceSellForm
          key={`${formKey}:${item.tokenId}`}
          formId={formId}
          item={item}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onListed?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </GlassSheet>
  );
}

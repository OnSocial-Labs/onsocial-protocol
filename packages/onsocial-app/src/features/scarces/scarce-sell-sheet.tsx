'use client';

import { useCallback, useId, useState } from 'react';
import { OsGestureSheet, osGestureSheetPanelCommerceClassName } from '@onsocial/ui';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceSellForm,
  type ScarceSellSuccessDetail,
} from '@/features/scarces/scarce-sell-form';

interface ScarceSellSheetProps {
  open: boolean;
  item: OwnedScarceItem | null;
  sellerAccountId?: string | null;
  onOpenChange: (open: boolean) => void;
  onListed?: (detail: ScarceSellSuccessDetail) => void;
}

/** Stable first-paint footer so hug height doesn’t jump when the form syncs. */
const SELL_FOOTER_SEED: CommerceSheetFooterState = {
  visible: true,
  primaryLabel: 'List for sale',
  primaryPendingLabel: 'Listing…',
  canSubmit: false,
  pending: false,
  disabled: true,
};

/** Owner sheet: list an owned scarce for secondary sale. */
export function ScarceSellSheet({
  open,
  item,
  sellerAccountId = null,
  onOpenChange,
  onListed,
}: ScarceSellSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState>(SELL_FOOTER_SEED);
  const sheetOpen = open && !closing && item != null;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setFooterState(SELL_FOOTER_SEED);
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
      if (!state?.visible) {
        setFooterState(SELL_FOOTER_SEED);
        return;
      }
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
      verb="Sell"
      signal="reputation"
      closeAriaLabel="Close sell scarce"
      backdropLabel="Close sell scarce"
      keyboardOpen={keyboardOpen}
      panelStyle={panelStyle}
      panelClassName={osGestureSheetPanelCommerceClassName}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={56}
      footer={
        <CommerceSheetFooter
          formId={formId}
          keyboardOpen={keyboardOpen}
          state={footerState}
        />
      }
    >
      {item ? (
        <ScarceSellForm
          key={`${formKey}:${item.tokenId}`}
          formId={formId}
          item={item}
          sellerAccountId={sellerAccountId}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onListed?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}

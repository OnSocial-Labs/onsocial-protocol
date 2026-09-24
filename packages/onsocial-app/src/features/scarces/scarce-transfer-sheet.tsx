'use client';

import { useCallback, useId, useState } from 'react';
import { OsGestureSheet } from '@onsocial/ui';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  ScarceTransferForm,
  type ScarceTransferSuccessDetail,
} from '@/features/scarces/scarce-transfer-form';
import { SHEET_Z } from '@/lib/sheet-z';

interface ScarceTransferSheetProps {
  open: boolean;
  item: OwnedScarceItem | null;
  ownerAccountId?: string | null;
  onOpenChange: (open: boolean) => void;
  onTransferred?: (detail: ScarceTransferSuccessDetail) => void;
}

const TRANSFER_FOOTER_SEED: CommerceSheetFooterState = {
  visible: true,
  primaryLabel: 'Transfer',
  primaryPendingLabel: 'Transferring…',
  canSubmit: false,
  pending: false,
  disabled: true,
};

/** Owner sheet: send one scarce to another NEAR account. */
export function ScarceTransferSheet({
  open,
  item,
  ownerAccountId = null,
  onOpenChange,
  onTransferred,
}: ScarceTransferSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState>(TRANSFER_FOOTER_SEED);
  const sheetOpen = open && !closing && item != null;
  const { panelStyle, keyboardOpen, moodId } =
    useCommerceSheetKeyboard(sheetOpen);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setFooterState(TRANSFER_FOOTER_SEED);
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
        setFooterState(TRANSFER_FOOTER_SEED);
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
      verb="Transfer"
      signal="reputation"
      closeAriaLabel="Close transfer scarce"
      backdropLabel="Close transfer scarce"
      keyboardOpen={keyboardOpen}
      moodId={moodId}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={SHEET_Z.gesture}
      footer={
        <CommerceSheetFooter
          formId={formId}
          keyboardOpen={keyboardOpen}
          state={footerState}
        />
      }
    >
      {item ? (
        <ScarceTransferForm
          key={`${formKey}:${item.tokenId}`}
          formId={formId}
          item={item}
          ownerAccountId={ownerAccountId}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={(detail) => {
            onTransferred?.(detail);
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}

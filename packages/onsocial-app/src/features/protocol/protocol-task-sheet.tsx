'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import {
  OsGestureSheet,
  type GestureSheetSignal,
} from '@onsocial/ui';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';

/**
 * Full-height Protocol task sheet — same chrome as Scarces sell/list/buy
 * (`OsGestureSheet`, keyboard lift, pinned footer).
 * Keep Vote/Finalize on the compact peek action sheet.
 */
export function ProtocolTaskSheet({
  open,
  onClose,
  verb,
  whisper,
  handle,
  signal = 'reputation',
  closeAriaLabel,
  backdropLabel,
  formId,
  footerState,
  children,
}: {
  open: boolean;
  onClose: () => void;
  verb: string;
  whisper?: ReactNode;
  handle?: string;
  signal?: GestureSheetSignal;
  closeAriaLabel: string;
  backdropLabel: string;
  formId?: string;
  footerState: CommerceSheetFooterState | null;
  children: ReactNode;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const { panelStyle, keyboardOpen, moodId } =
    useCommerceSheetKeyboard(sheetOpen);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb={verb}
      handle={handle}
      signal={signal}
      whisper={whisper}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      keyboardOpen={keyboardOpen}
      moodId={moodId}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body protocol-task-sheet-body"
      titleId={titleId}
      zIndex={PROTOCOL_TASK_SHEET_Z}
      footer={
        footerState?.visible ? (
          <CommerceSheetFooter
            formId={formId ?? ''}
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      {children}
    </OsGestureSheet>
  );
}

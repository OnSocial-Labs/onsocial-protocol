'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import type { GestureSheetSignal } from '@/components/panels/gesture-sheet-header';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { useScrollLock } from '@/hooks/use-scroll-lock';

/**
 * Full-height Protocol task sheet — same chrome as Scarces sell/list/buy
 * (GlassSheet full detent, GestureSheetHeader, keyboard lift, pinned footer).
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
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

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
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel={backdropLabel}
      bodyClassName="profile-support-sheet-body protocol-task-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb={verb}
            handle={handle}
            signal={signal}
            closeAriaLabel={closeAriaLabel}
            onClose={requestClose}
            whisper={whisper}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
    </GlassSheet>
  );
}

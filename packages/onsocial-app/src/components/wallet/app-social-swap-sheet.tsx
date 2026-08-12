'use client';

import { useCallback, useId, useState, type CSSProperties } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { AppSocialSwapForm } from '@/components/wallet/app-social-swap-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';

interface AppSocialSwapSheetProps {
  open: boolean;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onClosed?: () => void;
}

/** Nested Get SOCIAL sheet — Rhea swap aligned with storage drawer chrome. */
export function AppSocialSwapSheet({
  open,
  panelStyle,
  onClose,
  onClosed,
}: AppSocialSwapSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  useScrollLock(sheetOpen);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClosed?.();
    onClose();
  }, [onClose, onClosed]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      presentation="swap"
      initialDetent="full"
      peekRatio={1}
      zIndex={57}
      ariaLabelledBy={titleId}
      backdropLabel="Close Get SOCIAL"
      panelClassName="account-storage-panel"
      panelStyle={panelStyle}
      bodyClassName="account-storage-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Get SOCIAL"
            onClose={requestClose}
            closeAriaLabel="Close Get SOCIAL"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="app-storage-sheet">
        <AppSocialSwapForm onSuccess={requestClose} />
      </div>
    </GlassSheet>
  );
}

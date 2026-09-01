'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { AppSocialSwapForm } from '@/components/wallet/app-social-swap-form';
import { SHEET_Z } from '@/lib/sheet-z';

interface AppSocialSwapSheetProps {
  open: boolean;
  pageMoodId?: string | null;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onClosed?: () => void;
}

/** Nested Get SOCIAL sheet — Rhea swap aligned with storage drawer chrome. */
export function AppSocialSwapSheet({
  open,
  pageMoodId = null,
  panelStyle,
  onClose,
  onClosed,
}: AppSocialSwapSheetProps) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClosed?.();
    onClose();
  }, [onClose, onClosed]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Get SOCIAL"
      closeAriaLabel="Close Get SOCIAL"
      backdropLabel="Close Get SOCIAL"
      zIndex={SHEET_Z.facts}
      panelClassName={`account-storage-panel os-sheet-cap-tall${pageMoodId ? ' account-storage-panel--page-mood' : ''}`}
      {...(panelStyle ? { panelStyle } : {})}
    >
      <div className="app-storage-sheet">
        <AppSocialSwapForm onSuccess={requestClose} />
      </div>
    </OsHugSheet>
  );
}

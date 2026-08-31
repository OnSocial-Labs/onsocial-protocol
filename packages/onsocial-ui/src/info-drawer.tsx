'use client';

import { useCallback, useState } from 'react';
import { OsSheetAction } from './os-sheet-action.js';
import { OsSheetActions } from './os-sheet-actions.js';
import { OsSheetFooter } from './os-sheet-footer.js';
import { OsHugSheet } from './os-hug-sheet.js';

export interface InfoDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  summary: string;
  detail: string;
  zIndex?: number;
  gotItLabel?: string;
}

/** Content-hugging info drawer — same open/spacing as choice drawers. */
export function InfoDrawer({
  open,
  onClose,
  title,
  summary,
  detail,
  zIndex = 60,
  gotItLabel = 'Got it',
}: InfoDrawerProps) {
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
    onClose();
  }, [onClose]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={title}
      closeAriaLabel="Close"
      backdropLabel="Close"
      zIndex={zIndex}
      chrome="choice"
      bodyClassName="os-info-drawer-body"
      footer={
        <OsSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              onClick={requestClose}
            >
              {gotItLabel}
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      <p className="os-info-drawer-summary">{summary}</p>
      <p className="os-info-drawer-detail">{detail}</p>
    </OsHugSheet>
  );
}

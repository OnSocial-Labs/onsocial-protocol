'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';

export function DropCreateExtraSheet({
  open,
  title,
  hint,
  children,
  onDone,
}: {
  open: boolean;
  title: string;
  hint?: string;
  children: ReactNode;
  onDone: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const openEpoch = useRef(0);
  const closeEpoch = useRef(0);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      openEpoch.current += 1;
      setClosing(false);
    }
  }

  const requestClose = useCallback(() => {
    closeEpoch.current = openEpoch.current;
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    const started = closeEpoch.current;
    setClosing(false);
    if (started !== openEpoch.current) return;
    onDone();
  }, [onDone]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      chrome="choice"
      label={title}
      closeAriaLabel="Close"
      backdropLabel="Close"
      zIndex={SHEET_Z.list}
      bodyClassName="drop-create-extra-sheet-body"
      footer={
        <OsSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              onClick={requestClose}
            >
              Done
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      {hint ? <p className="os-choice-sheet-hint">{hint}</p> : null}
      {children}
    </OsHugSheet>
  );
}

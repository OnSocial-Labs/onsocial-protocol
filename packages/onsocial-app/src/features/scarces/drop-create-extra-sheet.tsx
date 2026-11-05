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
  sheetId = '',
  title,
  hint,
  children,
  onDone,
}: {
  open: boolean;
  /** Changes when the parent swaps Sale for Per wallet without a close. */
  sheetId?: string;
  title: string;
  hint?: string;
  children: ReactNode;
  onDone: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [seenSheetId, setSeenSheetId] = useState(sheetId);
  const [openEpoch, setOpenEpoch] = useState(0);
  const closeEpoch = useRef(0);
  const sheetOpen = open && !closing;

  if (sheetId !== seenSheetId) {
    setSeenSheetId(sheetId);
    if (open) {
      setOpenEpoch(openEpoch + 1);
      setClosing(false);
    }
  }

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpenEpoch(openEpoch + 1);
      setClosing(false);
    }
  }

  const requestClose = useCallback(() => {
    closeEpoch.current = openEpoch;
    setClosing(true);
  }, [openEpoch]);

  const handleClosed = useCallback(() => {
    const started = closeEpoch.current;
    setClosing(false);
    if (started !== openEpoch) return;
    onDone();
  }, [onDone, openEpoch]);

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

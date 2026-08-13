'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetAction,
  OsSheetActions,
  SheetHeader,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

interface InfoDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  summary: string;
  detail: string;
}

/** Content-hugging info drawer — same open/spacing as choice drawers. */
export function InfoDrawer({
  open,
  onClose,
  title,
  summary,
  detail,
}: InfoDrawerProps) {
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
    onClose();
  }, [onClose]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={60}
      ariaLabelledBy={titleId}
      backdropLabel="Close"
      sizing="hug"
      panelClassName="scarce-choice-sheet-panel"
      bodyClassName="scarce-choice-sheet-body account-social-help-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title}
            onClose={requestClose}
            closeAriaLabel="Close"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <p className="account-social-help-summary">{summary}</p>
      <p className="account-social-help-detail">{detail}</p>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready
          onClick={requestClose}
        >
          Got it
        </OsSheetAction>
      </OsSheetActions>
    </GlassSheet>
  );
}

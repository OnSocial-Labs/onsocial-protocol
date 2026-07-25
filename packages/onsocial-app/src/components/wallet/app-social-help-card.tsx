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
import {
  APP_SOCIAL_HELP_DETAIL,
  APP_SOCIAL_HELP_SUMMARY,
  APP_SOCIAL_HELP_TITLE,
} from '@/lib/app-reward-constants';

interface AppSocialHelpCardProps {
  open: boolean;
  onClose: () => void;
}

/** Content-hugging info drawer — same open/spacing as choice drawers. */
export function AppSocialHelpCard({ open, onClose }: AppSocialHelpCardProps) {
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
      backdropLabel="Close help"
      panelClassName="scarce-choice-sheet-panel"
      bodyClassName="scarce-choice-sheet-body account-social-help-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={APP_SOCIAL_HELP_TITLE}
            onClose={requestClose}
            closeAriaLabel="Close help"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <p className="account-social-help-summary">{APP_SOCIAL_HELP_SUMMARY}</p>
      <p className="account-social-help-detail">{APP_SOCIAL_HELP_DETAIL}</p>
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

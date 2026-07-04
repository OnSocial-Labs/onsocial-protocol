'use client';

import { useEffect, useId, useRef } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
} from '@/components/ui/os-sheet-primary-action';
import {
  APP_SOCIAL_HELP_SUMMARY,
  APP_SOCIAL_HELP_TITLE,
} from '@/lib/app-reward-constants';

interface AppSocialHelpCardProps {
  open: boolean;
  onClose: () => void;
}

export function AppSocialHelpCard({ open, onClose }: AppSocialHelpCardProps) {
  const titleId = useId();
  const gotItRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    gotItRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="account-social-help-layer">
      <button
        type="button"
        className="account-social-help-backdrop"
        aria-label="Close help"
        onClick={onClose}
      />
      <div
        id="account-social-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} account-social-help-card`}
      >
        <div className="account-social-help-copy">
          <p id={titleId} className="account-social-help-title">
            {APP_SOCIAL_HELP_TITLE}
          </p>
          <p className="account-social-help-body">{APP_SOCIAL_HELP_SUMMARY}</p>
        </div>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            ref={gotItRef}
            type="button"
            variant="primary"
            ready
            onClick={onClose}
          >
            Got it
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </div>
  );
}

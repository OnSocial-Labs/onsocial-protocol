'use client';

import { useEffect, useId, useRef } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { OsNoticeCard } from '@/components/ui/os-notice-card';
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
      <OsNoticeCard
        id="account-social-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="account-social-help-card"
        align="center"
        shell
        title={APP_SOCIAL_HELP_TITLE}
        titleId={titleId}
        body={APP_SOCIAL_HELP_SUMMARY}
        footer={
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
        }
      />
    </div>
  );
}

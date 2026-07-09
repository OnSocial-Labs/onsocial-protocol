'use client';

import { useEffect, useId, useRef } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { OsNoticeCard } from '@/components/ui/os-notice-card';
import { AccountEditorChrome } from '@/components/wallet/account-editor-chrome';

interface ProfileEditorLoadErrorProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

export function ProfileEditorLoadError({
  message,
  onRetry,
  onClose,
}: ProfileEditorLoadErrorProps) {
  const titleId = useId();
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div
      className="account-editor-loading-shell account-editor-load-error-shell"
      role="alert"
    >
      <section className="account-editor-hero" aria-hidden>
        <div className="account-editor-cover-stage">
          <div className="account-editor-banner-wrap profile-editor-media-banner-dock">
            <div className="account-editor-banner-button account-editor-banner-empty-tone" />
          </div>

          <AccountEditorChrome
            titleId="profile-editor-title"
            title="Edit profile"
            onClose={onClose}
            className="account-editor-hero-chrome"
          />
        </div>
      </section>

      <div className="account-editor-load-error-body">
        <OsNoticeCard
          align="center"
          shell
          className="account-editor-load-error-card"
          title="Couldn’t load profile"
          titleId={titleId}
          body={message}
          footer={
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                ref={retryRef}
                type="button"
                variant="primary"
                ready
                onClick={onRetry}
              >
                Retry
              </OsSheetAction>
            </OsSheetActions>
          }
        />
      </div>
    </div>
  );
}

'use client';

import { Divider } from '@onsocial/ui';
import { AccountEditorChrome } from '@/components/wallet/account-editor-chrome';

export function ProfileEditorLoadingSkeleton({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="account-editor-loading-shell"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <section className="account-editor-hero" aria-hidden>
        <div className="account-editor-cover-stage">
          <div className="account-editor-banner-button account-editor-shimmer" />

          <AccountEditorChrome
            titleId="profile-editor-title"
            title="Edit profile"
            onClose={onClose}
            className="account-editor-hero-chrome"
          />

          <div className="account-editor-hero-overlap">
            <div className="account-editor-identity">
              <div className="account-editor-avatar account-editor-shimmer" />
              <div className="account-editor-identity-copy account-editor-skeleton-copy">
                <div className="account-editor-shimmer account-editor-shimmer-name" />
                <div className="account-editor-shimmer account-editor-shimmer-handle" />
                <div className="account-editor-shimmer account-editor-shimmer-bio" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="account-editor-form-body account-editor-skeleton-body">
        <Divider variant="section" className="account-editor-section-divider" />
        <div className="account-editor-shimmer account-editor-shimmer-section-label" />
        <div className="account-editor-shimmer account-editor-shimmer-link" />
        <div className="account-editor-shimmer account-editor-shimmer-link" />
        <div className="account-editor-shimmer account-editor-shimmer-section-label" />
        <div className="account-editor-skeleton-tags">
          <div className="account-editor-shimmer account-editor-shimmer-tag" />
          <div className="account-editor-shimmer account-editor-shimmer-tag" />
        </div>
      </div>

      <div className="account-editor-footer account-editor-footer--skeleton">
        <div className="account-editor-shimmer account-editor-shimmer-save" />
      </div>
    </div>
  );
}

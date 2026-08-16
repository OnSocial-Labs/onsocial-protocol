'use client';

import { Divider } from '@onsocial/ui';

export function ProfileEditorLoadingSkeleton() {
  return (
    <div
      className="account-editor-loading-shell"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <section className="account-editor-hero" aria-hidden>
        <div className="account-editor-cover-stage">
          <div className="account-editor-banner-wrap">
            <div className="account-editor-banner-button account-editor-shimmer">
              <p
                className="profile-editor-media-size-hint profile-editor-media-size-hint--dock account-editor-skeleton-hint"
                aria-hidden
              >
                &nbsp;
              </p>
            </div>
          </div>

          <div className="account-editor-hero-overlap">
            <div className="account-editor-identity">
              <div className="account-editor-avatar-wrap">
                <div className="account-editor-avatar account-editor-shimmer" />
              </div>
              <div className="account-editor-identity-copy account-editor-skeleton-copy">
                <div className="account-editor-shimmer account-editor-shimmer-name" />
                <div className="account-editor-shimmer account-editor-shimmer-handle" />
                <div className="account-editor-shimmer account-editor-shimmer-bio" />
                <div className="account-editor-shimmer account-editor-shimmer-limits" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="account-editor-form-body account-editor-skeleton-body">
        <Divider variant="section" className="account-editor-section-divider" />
        <div className="account-editor-skeleton-links">
          <div className="account-editor-shimmer account-editor-shimmer-link-chip" />
          <div className="account-editor-shimmer account-editor-shimmer-link-chip" />
          <div className="account-editor-shimmer account-editor-shimmer-link-chip" />
        </div>
      </div>
    </div>
  );
}

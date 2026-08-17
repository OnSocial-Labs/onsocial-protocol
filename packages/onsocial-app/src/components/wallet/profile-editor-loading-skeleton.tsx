'use client';

const LINK_ROW_WIDTHS = ['is-wide', 'is-mid'] as const;

export function ProfileEditorLoadingSkeleton() {
  return (
    <div
      className="account-editor-form profile-edit-form"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className="account-editor-form-main profile-edit-form-main">
        <section className="account-editor-hero profile-edit-hero" aria-hidden>
          <div className="account-editor-cover-stage">
            <div className="account-editor-banner-wrap">
              <div className="account-editor-banner-button">
                <span className="account-editor-banner-empty" />
                <span className="account-editor-shimmer account-editor-shimmer-banner" />
              </div>
            </div>

            <div className="account-editor-hero-overlap">
              <div className="account-editor-identity">
                <div className="account-editor-avatar-wrap">
                  <div className="account-editor-avatar account-editor-shimmer" />
                </div>
                <div className="account-editor-identity-copy">
                  <div className="account-editor-name-wrap">
                    <span className="account-editor-shimmer account-editor-shimmer-name" />
                  </div>
                  <span className="account-editor-shimmer account-editor-shimmer-handle" />
                  <div className="account-editor-bio-shell">
                    <span className="account-editor-shimmer account-editor-shimmer-bio" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="account-editor-form-body">
          <section className="account-editor-section account-editor-links-section">
            <div className="account-editor-link-grid">
              {LINK_ROW_WIDTHS.map((widthClass) => (
                <div key={widthClass} className="account-editor-link-field">
                  <div className="account-editor-link-input">
                    <span className="account-editor-link-icon-slot">
                      <span className="account-editor-shimmer account-editor-shimmer-link-icon" />
                    </span>
                    <span
                      className={`account-editor-shimmer account-editor-shimmer-link-url ${widthClass}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="account-editor-links-actions">
              <span className="account-editor-shimmer account-editor-shimmer-add-link" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

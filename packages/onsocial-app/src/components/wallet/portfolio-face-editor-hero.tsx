'use client';

import type { ReactNode } from 'react';
import type { ProfileAvatarShape, ProfileKind } from '@onsocial/sdk';
import { ProfileEditorMediaToolbar } from '@onsocial/ui';
import { MediaFramePanSurface } from '@/components/media/media-frame-pan-surface';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
} from '@/lib/hero-img-variants';
import {
  MEDIA_FRAME_PAN_CENTER,
  type MediaFramePan,
} from '@/lib/media-frame-pan';

export type PortfolioFaceBannerMedia =
  | { kind: 'image'; url: string; srcSet?: string }
  | { kind: 'video'; url: string; poster?: string };

/**
 * Shared Edit profile / Edit DAO cover + mark under absolute glass chrome.
 * Parents own file inputs and save bake; this paints the portfolio face.
 */
export function PortfolioFaceEditorHero({
  ariaLabel,
  banner,
  bannerPan = MEDIA_FRAME_PAN_CENTER,
  onBannerPanChange,
  onBannerPick,
  onRemoveBanner,
  bannerAddLabel = 'Add banner',
  bannerChangeLabel = 'Change banner',
  bannerRemoveLabel = 'Remove banner',
  markUrl,
  markSrcSet,
  markPan = MEDIA_FRAME_PAN_CENTER,
  onMarkPanChange,
  onMarkPick,
  onRemoveMark,
  markAddLabel = 'Add photo',
  markRemoveLabel = 'Remove photo',
  markFallback,
  profileKind,
  avatarShape,
  disabled = false,
  identityCopy,
}: {
  ariaLabel: string;
  banner: PortfolioFaceBannerMedia | null;
  bannerPan?: MediaFramePan;
  onBannerPanChange?: (pan: MediaFramePan) => void;
  onBannerPick: () => void;
  onRemoveBanner?: () => void;
  bannerAddLabel?: string;
  bannerChangeLabel?: string;
  bannerRemoveLabel?: string;
  markUrl: string | null;
  markSrcSet?: string;
  markPan?: MediaFramePan;
  onMarkPanChange?: (pan: MediaFramePan) => void;
  onMarkPick: () => void;
  onRemoveMark?: () => void;
  markAddLabel?: string;
  markRemoveLabel?: string;
  markFallback: ReactNode;
  profileKind: ProfileKind;
  avatarShape: ProfileAvatarShape;
  disabled?: boolean;
  /** Profile name / handle block under the mark; omit on DAO. */
  identityCopy?: ReactNode;
}) {
  const hasBanner = banner != null;

  return (
    <section
      className="account-editor-hero profile-edit-hero"
      aria-label={ariaLabel}
    >
      <div
        className={`account-editor-cover-stage${hasBanner ? ' has-media' : ''}`}
      >
        <div className="account-editor-banner-wrap">
          <div
            className={`account-editor-banner-button profile-editor-media-host${
              hasBanner ? ' has-media' : ''
            }`}
          >
            {banner?.kind === 'video' ? (
              <button
                type="button"
                className="profile-editor-media-backdrop account-editor-banner-backdrop"
                onClick={onBannerPick}
                aria-label={bannerChangeLabel}
                disabled={disabled}
              >
                <video
                  src={banner.url}
                  poster={banner.poster}
                  className="account-editor-banner-video"
                  muted
                  loop
                  playsInline
                  autoPlay
                  aria-hidden
                />
                <span
                  className="account-editor-banner-overlay has-media"
                  aria-hidden
                />
              </button>
            ) : banner?.kind === 'image' && onBannerPanChange ? (
              <MediaFramePanSurface
                src={banner.url}
                srcSet={banner.srcSet}
                sizes={banner.srcSet ? APP_COLUMN_HERO_SIZES : undefined}
                pan={bannerPan}
                onPanChange={onBannerPanChange}
                onTap={onBannerPick}
                disabled={disabled}
                className="account-editor-banner-backdrop"
                imgClassName="account-editor-banner-image"
              >
                <span
                  className="account-editor-banner-overlay has-media"
                  aria-hidden
                />
              </MediaFramePanSurface>
            ) : (
              <button
                type="button"
                className="profile-editor-media-backdrop account-editor-banner-backdrop"
                onClick={onBannerPick}
                aria-label={bannerAddLabel}
                disabled={disabled}
              >
                <span className="account-editor-banner-empty" aria-hidden />
                <span className="account-editor-banner-overlay" aria-hidden />
              </button>
            )}
            <ProfileEditorMediaToolbar
              layout="banner"
              corner="bottom"
              removeLabel={hasBanner ? bannerRemoveLabel : undefined}
              onRemove={hasBanner ? onRemoveBanner : undefined}
            />
            {hasBanner ? null : (
              <p
                className="profile-editor-media-size-hint profile-editor-media-size-hint--dock"
                aria-hidden
              >
                Photo or video
              </p>
            )}
          </div>
        </div>

        <div className="account-editor-hero-overlap">
          <div className="account-editor-identity">
            <div className="account-editor-avatar-wrap">
              <div
                className={`account-editor-avatar profile-editor-media-host profile-editor-media-host--avatar${
                  markUrl ? ' has-media' : ''
                }`}
                data-profile-kind={profileKind}
                data-avatar-shape={avatarShape}
              >
                {markUrl && onMarkPanChange ? (
                  <MediaFramePanSurface
                    src={markUrl}
                    srcSet={markSrcSet}
                    sizes={markSrcSet ? EDITOR_MARK_SIZES : undefined}
                    pan={markPan}
                    onPanChange={onMarkPanChange}
                    onTap={onMarkPick}
                    disabled={disabled}
                    className="account-editor-avatar-backdrop"
                    imgClassName="account-editor-avatar-image"
                  >
                    <span
                      className="profile-editor-media-overlay account-editor-avatar-overlay has-media"
                      aria-hidden
                    />
                  </MediaFramePanSurface>
                ) : (
                  <button
                    type="button"
                    className="profile-editor-media-backdrop account-editor-avatar-backdrop"
                    onClick={onMarkPick}
                    aria-label={markAddLabel}
                    disabled={disabled}
                  >
                    <span
                      className="account-editor-avatar-fallback"
                      aria-hidden
                    >
                      {markFallback}
                    </span>
                    <span
                      className="profile-editor-media-overlay account-editor-avatar-overlay"
                      aria-hidden
                    />
                  </button>
                )}
              </div>
              <ProfileEditorMediaToolbar
                layout="avatar"
                removeLabel={markUrl ? markRemoveLabel : undefined}
                onRemove={markUrl ? onRemoveMark : undefined}
              />
            </div>
            {identityCopy}
          </div>
        </div>
      </div>
    </section>
  );
}

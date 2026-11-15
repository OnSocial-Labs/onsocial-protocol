'use client';

import { useRef, type ChangeEvent } from 'react';
import {
  IpfsImg,
  ipfsImgSrcSet,
  ProfileEditorMediaToolbar,
} from '@onsocial/ui';
import { communityMonogram } from '@/components/community-cards/community-monogram';
import { MediaFramePanSurface } from '@/components/media/media-frame-pan-surface';
import {
  HUB_CREATE_ADD_BANNER,
  HUB_CREATE_ADD_LOGO,
  HUB_CREATE_CHANGE_BANNER,
  HUB_CREATE_CHANGE_LOGO,
  HUB_CREATE_REMOVE_BANNER,
  HUB_CREATE_REMOVE_LOGO,
} from '@/features/scarces/hub-create-voice';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
  EDITOR_MARK_WIDTHS,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';
import {
  MEDIA_FRAME_PAN_CENTER,
  type MediaFramePan,
} from '@/lib/media-frame-pan';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';

/** Live hub cover scale — create and edit compose the same face. */
export function HubLookPreview({
  bannerUrl,
  logoUrl,
  name = '',
  disabled = false,
  accept = DEFAULT_ACCEPT,
  bannerFileAttr = 'banner',
  logoFileAttr = 'logo',
  bannerPan = MEDIA_FRAME_PAN_CENTER,
  logoPan = MEDIA_FRAME_PAN_CENTER,
  onBannerPanChange,
  onLogoPanChange,
  onBannerChange,
  onLogoChange,
  onRemoveBanner,
  onRemoveLogo,
}: {
  bannerUrl: string | null;
  logoUrl: string | null;
  name?: string;
  disabled?: boolean;
  accept?: string;
  bannerFileAttr?: string;
  logoFileAttr?: string;
  bannerPan?: MediaFramePan;
  logoPan?: MediaFramePan;
  onBannerPanChange?: (pan: MediaFramePan) => void;
  onLogoPanChange?: (pan: MediaFramePan) => void;
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLogoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner?: () => void;
  onRemoveLogo?: () => void;
}) {
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();
  const logoFallback = trimmedName ? communityMonogram(trimmedName) : 'Logo';
  // Blob picks bypass; only the existing CDN banner/logo variant.
  const bannerSrcSet = ipfsImgSrcSet(bannerUrl, SCARCE_HERO_WIDTHS);
  const logoSrcSet = ipfsImgSrcSet(logoUrl, EDITOR_MARK_WIDTHS);
  const openBannerPicker = () => bannerInputRef.current?.click();
  const openLogoPicker = () => logoInputRef.current?.click();

  return (
    <section className="hub-look-preview" aria-label="Hub look">
      <div
        className={`hub-look-preview-banner profile-editor-media-host${
          bannerUrl ? ' has-media' : ''
        }`}
      >
        {bannerUrl && onBannerPanChange ? (
          <MediaFramePanSurface
            src={bannerUrl}
            srcSet={bannerSrcSet}
            sizes={bannerSrcSet ? APP_COLUMN_HERO_SIZES : undefined}
            pan={bannerPan}
            onPanChange={onBannerPanChange}
            onTap={openBannerPicker}
            disabled={disabled}
            className="account-editor-banner-backdrop hub-look-preview-banner-hit"
            imgClassName="account-editor-banner-image hub-look-preview-banner-image"
          >
            <span
              className="account-editor-banner-overlay has-media"
              aria-hidden
            />
          </MediaFramePanSurface>
        ) : (
          <button
            type="button"
            className="profile-editor-media-backdrop account-editor-banner-backdrop hub-look-preview-banner-hit"
            aria-label={
              bannerUrl ? HUB_CREATE_CHANGE_BANNER : HUB_CREATE_ADD_BANNER
            }
            disabled={disabled}
            onClick={openBannerPicker}
          >
            {bannerUrl ? (
              <IpfsImg
                src={bannerUrl}
                srcSet={bannerSrcSet}
                sizes={bannerSrcSet ? APP_COLUMN_HERO_SIZES : undefined}
                alt=""
                className="account-editor-banner-image hub-look-preview-banner-image"
              />
            ) : (
              <span className="account-editor-banner-empty" aria-hidden />
            )}
            <span
              className={`account-editor-banner-overlay${
                bannerUrl ? ' has-media' : ''
              }`}
              aria-hidden
            />
          </button>
        )}
        <ProfileEditorMediaToolbar
          layout="banner"
          corner="bottom"
          removeLabel={bannerUrl ? HUB_CREATE_REMOVE_BANNER : undefined}
          onRemove={bannerUrl ? onRemoveBanner : undefined}
        />
        {bannerUrl ? null : (
          <p
            className="profile-editor-media-size-hint hub-look-preview-banner-hint"
            aria-hidden
          >
            Photo or video
          </p>
        )}
      </div>
      <div className="hub-look-preview-head">
        <div
          className={`hub-look-preview-logo profile-editor-media-host profile-editor-media-host--avatar profile-editor-media-host--squircle${
            logoUrl ? ' has-media' : ''
          }`}
        >
          {logoUrl && onLogoPanChange ? (
            <MediaFramePanSurface
              src={logoUrl}
              srcSet={logoSrcSet}
              sizes={logoSrcSet ? EDITOR_MARK_SIZES : undefined}
              pan={logoPan}
              onPanChange={onLogoPanChange}
              onTap={openLogoPicker}
              disabled={disabled}
              className="hub-look-preview-logo-hit"
              imgClassName="hub-look-preview-logo-image"
            />
          ) : (
            <button
              type="button"
              className="profile-editor-media-backdrop hub-look-preview-logo-hit"
              aria-label={logoUrl ? HUB_CREATE_CHANGE_LOGO : HUB_CREATE_ADD_LOGO}
              disabled={disabled}
              onClick={openLogoPicker}
            >
              {logoUrl ? (
                <IpfsImg
                  src={logoUrl}
                  srcSet={logoSrcSet}
                  sizes={logoSrcSet ? EDITOR_MARK_SIZES : undefined}
                  alt=""
                  className="hub-look-preview-logo-image"
                />
              ) : (
                <span className="hub-look-preview-logo-empty" aria-hidden>
                  {logoFallback}
                </span>
              )}
            </button>
          )}
          <ProfileEditorMediaToolbar
            layout="avatar"
            removeLabel={logoUrl ? HUB_CREATE_REMOVE_LOGO : undefined}
            onRemove={logoUrl ? onRemoveLogo : undefined}
          />
        </div>
      </div>
      <input
        ref={bannerInputRef}
        type="file"
        accept={accept}
        data-hub-look-file={bannerFileAttr}
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onBannerChange}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept={accept}
        data-hub-look-file={logoFileAttr}
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onLogoChange}
      />
    </section>
  );
}

'use client';

import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  IpfsImg,
  ipfsImgSrcSet,
  ProfileEditorMediaToolbar,
} from '@onsocial/ui';
import { communityMonogram } from '@/components/community-cards/community-monogram';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
  EDITOR_MARK_WIDTHS,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';

export function HubLookPreview({
  bannerUrl,
  logoUrl,
  name = '',
  disabled = false,
  accept = DEFAULT_ACCEPT,
  bannerFileAttr = 'banner',
  logoFileAttr = 'logo',
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
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLogoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner?: () => void;
  onRemoveLogo?: () => void;
}) {
  const t = useTranslations('shell');
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();
  const logoFallback = trimmedName
    ? communityMonogram(trimmedName)
    : t('look.logo');
  // Blob picks bypass; only the existing CDN banner/logo variant.
  const bannerSrcSet = ipfsImgSrcSet(bannerUrl, SCARCE_HERO_WIDTHS);
  const logoSrcSet = ipfsImgSrcSet(logoUrl, EDITOR_MARK_WIDTHS);

  return (
    <section className="hub-look-preview" aria-label={t('look.hub')}>
      <div
        className={`hub-look-preview-banner profile-editor-media-host${
          bannerUrl ? ' has-media' : ''
        }`}
      >
        <button
          type="button"
          className="profile-editor-media-backdrop account-editor-banner-backdrop hub-look-preview-banner-hit"
          aria-label={bannerUrl ? t('look.changeBanner') : t('look.addBanner')}
          disabled={disabled}
          onClick={() => bannerInputRef.current?.click()}
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
        <ProfileEditorMediaToolbar
          layout="banner"
          removeLabel={bannerUrl ? t('look.removeBanner') : undefined}
          onRemove={bannerUrl ? onRemoveBanner : undefined}
        />
        {bannerUrl ? null : (
          <p
            className="profile-editor-media-size-hint profile-editor-media-size-hint--dock"
            aria-hidden
          >
            {t('look.photoOrVideo')}
          </p>
        )}
      </div>
      <div className="hub-look-preview-head">
        <div
          className={`hub-look-preview-logo profile-editor-media-host profile-editor-media-host--avatar profile-editor-media-host--squircle${
            logoUrl ? ' has-media' : ''
          }`}
        >
          <button
            type="button"
            className="profile-editor-media-backdrop hub-look-preview-logo-hit"
            aria-label={logoUrl ? t('look.changeLogo') : t('look.addLogo')}
            disabled={disabled}
            onClick={() => logoInputRef.current?.click()}
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
          <ProfileEditorMediaToolbar
            layout="avatar"
            removeLabel={logoUrl ? t('look.removeLogo') : undefined}
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

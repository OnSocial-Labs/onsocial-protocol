'use client';

import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  IpfsImg,
  ipfsImgSrcSet,
  ProfileEditorMediaToolbar,
} from '@onsocial/ui';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
  EDITOR_MARK_WIDTHS,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';

export function GuildLookPreview({
  bannerUrl,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  onBannerChange,
  onRemoveBanner,
}: {
  bannerUrl: string | null;
  disabled?: boolean;
  accept?: string;
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner?: () => void;
}) {
  const t = useTranslations('shell');
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Fresh picks are blob URLs — the helper bypasses them and only the
  // existing CDN art variants.
  const bannerSrcSet = ipfsImgSrcSet(bannerUrl, SCARCE_HERO_WIDTHS);

  return (
    <section className="guild-look-preview" aria-label={t('look.guild')}>
      <div
        className={`guild-look-preview-banner profile-editor-media-host${
          bannerUrl ? ' has-media' : ''
        }`}
      >
        <button
          type="button"
          className="profile-editor-media-backdrop account-editor-banner-backdrop guild-look-preview-banner-hit"
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
              className="account-editor-banner-image guild-look-preview-banner-image"
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
      <input
        ref={bannerInputRef}
        type="file"
        accept={accept}
        data-guild-look-file="banner"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onBannerChange}
      />
    </section>
  );
}

/** Square mark that sits beside the name — same place as the guild page. */
export function GuildBadgeWell({
  badgeUrl,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  onBadgeChange,
  onRemoveBadge,
}: {
  badgeUrl: string | null;
  disabled?: boolean;
  accept?: string;
  onBadgeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBadge?: () => void;
}) {
  const t = useTranslations('shell');
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const badgeSrcSet = ipfsImgSrcSet(badgeUrl, EDITOR_MARK_WIDTHS);

  return (
    <div
      className={`guild-look-preview-badge profile-editor-media-host profile-editor-media-host--squircle${
        badgeUrl ? ' has-media' : ''
      }`}
    >
      <button
        type="button"
        className="profile-editor-media-backdrop guild-look-preview-badge-hit"
        aria-label={badgeUrl ? t('look.changeBadge') : t('look.addBadge')}
        disabled={disabled}
        onClick={() => badgeInputRef.current?.click()}
      >
        {badgeUrl ? (
          <IpfsImg
            src={badgeUrl}
            srcSet={badgeSrcSet}
            sizes={badgeSrcSet ? EDITOR_MARK_SIZES : undefined}
            alt=""
            className="guild-look-preview-badge-image"
          />
        ) : (
          <span className="guild-look-preview-badge-empty" aria-hidden>
            +
          </span>
        )}
      </button>
      <ProfileEditorMediaToolbar
        layout="avatar"
        removeLabel={badgeUrl ? t('look.removeBadge') : undefined}
        onRemove={badgeUrl ? onRemoveBadge : undefined}
      />
      <input
        ref={badgeInputRef}
        type="file"
        accept={accept}
        data-guild-look-file="badge"
        className="account-editor-file-input"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={onBadgeChange}
      />
    </div>
  );
}

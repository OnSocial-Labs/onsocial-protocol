'use client';

import { useRef, type ChangeEvent } from 'react';
import {
  IpfsImg,
  ipfsImgSrcSet,
  ProfileEditorMediaToolbar,
} from '@onsocial/ui';
import { MediaFramePanSurface } from '@/components/media/media-frame-pan-surface';
import {
  GUILD_CREATE_ADD_BADGE,
  GUILD_CREATE_ADD_BANNER,
  GUILD_CREATE_CHANGE_BADGE,
  GUILD_CREATE_CHANGE_BANNER,
  GUILD_CREATE_REMOVE_BADGE,
  GUILD_CREATE_REMOVE_BANNER,
} from '@/features/guilds/guild-create-voice';
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

/** Live guild cover scale — create and edit compose the same face. */
export function GuildLookPreview({
  bannerUrl,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  bannerPan = MEDIA_FRAME_PAN_CENTER,
  onBannerPanChange,
  onBannerChange,
  onRemoveBanner,
}: {
  bannerUrl: string | null;
  disabled?: boolean;
  accept?: string;
  bannerPan?: MediaFramePan;
  onBannerPanChange?: (pan: MediaFramePan) => void;
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner?: () => void;
}) {
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Fresh picks are blob URLs — the helper bypasses them and only the
  // existing CDN art variants.
  const bannerSrcSet = ipfsImgSrcSet(bannerUrl, SCARCE_HERO_WIDTHS);
  const openBannerPicker = () => bannerInputRef.current?.click();

  return (
    <section className="guild-look-preview" aria-label="Guild look">
      <div
        className={`guild-look-preview-banner profile-editor-media-host${
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
            className="account-editor-banner-backdrop guild-look-preview-banner-hit"
            imgClassName="account-editor-banner-image guild-look-preview-banner-image"
          >
            <span
              className="account-editor-banner-overlay has-media"
              aria-hidden
            />
          </MediaFramePanSurface>
        ) : (
          <button
            type="button"
            className="profile-editor-media-backdrop account-editor-banner-backdrop guild-look-preview-banner-hit"
            aria-label={
              bannerUrl ? GUILD_CREATE_CHANGE_BANNER : GUILD_CREATE_ADD_BANNER
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
        )}
        <ProfileEditorMediaToolbar
          layout="banner"
          corner="bottom"
          removeLabel={bannerUrl ? GUILD_CREATE_REMOVE_BANNER : undefined}
          onRemove={bannerUrl ? onRemoveBanner : undefined}
        />
        {bannerUrl ? null : (
          <p
            className="profile-editor-media-size-hint guild-look-preview-banner-hint"
            aria-hidden
          >
            Photo or video
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
  badgePan = MEDIA_FRAME_PAN_CENTER,
  onBadgePanChange,
  onBadgeChange,
  onRemoveBadge,
}: {
  badgeUrl: string | null;
  disabled?: boolean;
  accept?: string;
  badgePan?: MediaFramePan;
  onBadgePanChange?: (pan: MediaFramePan) => void;
  onBadgeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBadge?: () => void;
}) {
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const badgeSrcSet = ipfsImgSrcSet(badgeUrl, EDITOR_MARK_WIDTHS);
  const openBadgePicker = () => badgeInputRef.current?.click();

  return (
    <div
      className={`guild-look-preview-badge profile-editor-media-host profile-editor-media-host--squircle${
        badgeUrl ? ' has-media' : ''
      }`}
    >
      {badgeUrl && onBadgePanChange ? (
        <MediaFramePanSurface
          src={badgeUrl}
          srcSet={badgeSrcSet}
          sizes={badgeSrcSet ? EDITOR_MARK_SIZES : undefined}
          pan={badgePan}
          onPanChange={onBadgePanChange}
          onTap={openBadgePicker}
          disabled={disabled}
          className="guild-look-preview-badge-hit"
          imgClassName="guild-look-preview-badge-image"
        />
      ) : (
        <button
          type="button"
          className="profile-editor-media-backdrop guild-look-preview-badge-hit"
          aria-label={
            badgeUrl ? GUILD_CREATE_CHANGE_BADGE : GUILD_CREATE_ADD_BADGE
          }
          disabled={disabled}
          onClick={openBadgePicker}
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
      )}
      <ProfileEditorMediaToolbar
        layout="avatar"
        removeLabel={badgeUrl ? GUILD_CREATE_REMOVE_BADGE : undefined}
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

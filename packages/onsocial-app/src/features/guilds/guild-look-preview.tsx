'use client';

import { useRef, type ChangeEvent } from 'react';
import { ProfileEditorMediaToolbar } from '@onsocial/ui';
import {
  GUILD_CREATE_ADD_BADGE,
  GUILD_CREATE_ADD_BANNER,
  GUILD_CREATE_CHANGE_BADGE,
  GUILD_CREATE_CHANGE_BANNER,
  GUILD_CREATE_REMOVE_BADGE,
  GUILD_CREATE_REMOVE_BANNER,
} from '@/features/guilds/guild-create-voice';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';

export function GuildLookPreview({
  bannerUrl,
  badgeUrl,
  name = '',
  disabled = false,
  accept = DEFAULT_ACCEPT,
  onBannerChange,
  onBadgeChange,
  onRemoveBanner,
  onRemoveBadge,
}: {
  bannerUrl: string | null;
  badgeUrl: string | null;
  name?: string;
  disabled?: boolean;
  accept?: string;
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBadgeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner?: () => void;
  onRemoveBadge?: () => void;
}) {
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();

  return (
    <section className="guild-look-preview" aria-label="Guild look">
      <div
        className={`guild-look-preview-banner profile-editor-media-host${
          bannerUrl ? ' has-media' : ''
        }`}
      >
        <button
          type="button"
          className="profile-editor-media-backdrop guild-look-preview-banner-hit"
          aria-label={
            bannerUrl ? GUILD_CREATE_CHANGE_BANNER : GUILD_CREATE_ADD_BANNER
          }
          disabled={disabled}
          onClick={() => bannerInputRef.current?.click()}
        >
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="guild-look-preview-banner-image"
            />
          ) : (
            <span className="guild-look-preview-banner-empty">
              {GUILD_CREATE_ADD_BANNER}
            </span>
          )}
        </button>
        <ProfileEditorMediaToolbar
          layout="banner"
          removeLabel={bannerUrl ? GUILD_CREATE_REMOVE_BANNER : undefined}
          onRemove={bannerUrl ? onRemoveBanner : undefined}
        />
      </div>
      <div className="guild-look-preview-title">
        <div
          className={`guild-look-preview-badge profile-editor-media-host profile-editor-media-host--squircle${
            badgeUrl ? ' has-media' : ''
          }`}
        >
          <button
            type="button"
            className="profile-editor-media-backdrop guild-look-preview-badge-hit"
            aria-label={
              badgeUrl ? GUILD_CREATE_CHANGE_BADGE : GUILD_CREATE_ADD_BADGE
            }
            disabled={disabled}
            onClick={() => badgeInputRef.current?.click()}
          >
            {badgeUrl ? (
              <img
                src={badgeUrl}
                alt=""
                className="guild-look-preview-badge-image"
              />
            ) : (
              <span className="guild-look-preview-badge-empty" aria-hidden>
                {GUILD_CREATE_ADD_BADGE}
              </span>
            )}
          </button>
          <ProfileEditorMediaToolbar
            layout="avatar"
            removeLabel={badgeUrl ? GUILD_CREATE_REMOVE_BADGE : undefined}
            onRemove={badgeUrl ? onRemoveBadge : undefined}
          />
        </div>
        {trimmedName ? (
          <p className="guild-look-preview-name">{trimmedName}</p>
        ) : null}
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
    </section>
  );
}

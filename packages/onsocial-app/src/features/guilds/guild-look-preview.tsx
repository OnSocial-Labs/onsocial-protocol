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
  const bannerInputRef = useRef<HTMLInputElement>(null);

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
  const badgeInputRef = useRef<HTMLInputElement>(null);

  return (
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
            +
          </span>
        )}
      </button>
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

'use client';

import { useRef, type ChangeEvent } from 'react';
import { ProfileEditorMediaToolbar } from '@onsocial/ui';
import { communityMonogram } from '@/components/community-cards/community-monogram';
import {
  HUB_CREATE_ADD_BANNER,
  HUB_CREATE_ADD_LOGO,
  HUB_CREATE_CHANGE_BANNER,
  HUB_CREATE_CHANGE_LOGO,
  HUB_CREATE_REMOVE_BANNER,
  HUB_CREATE_REMOVE_LOGO,
} from '@/features/scarces/hub-create-voice';

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
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();
  const logoFallback = trimmedName ? communityMonogram(trimmedName) : 'Logo';

  return (
    <section className="hub-look-preview" aria-label="Hub look">
      <div
        className={`hub-look-preview-banner profile-editor-media-host${
          bannerUrl ? ' has-media' : ''
        }`}
      >
        <button
          type="button"
          className="profile-editor-media-backdrop hub-look-preview-banner-hit"
          aria-label={bannerUrl ? HUB_CREATE_CHANGE_BANNER : HUB_CREATE_ADD_BANNER}
          disabled={disabled}
          onClick={() => bannerInputRef.current?.click()}
        >
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="hub-look-preview-banner-image"
            />
          ) : (
            <span className="hub-look-preview-banner-empty">
              {HUB_CREATE_ADD_BANNER}
            </span>
          )}
        </button>
        <ProfileEditorMediaToolbar
          layout="banner"
          removeLabel={bannerUrl ? HUB_CREATE_REMOVE_BANNER : undefined}
          onRemove={bannerUrl ? onRemoveBanner : undefined}
        />
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
            aria-label={logoUrl ? HUB_CREATE_CHANGE_LOGO : HUB_CREATE_ADD_LOGO}
            disabled={disabled}
            onClick={() => logoInputRef.current?.click()}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="hub-look-preview-logo-image" />
            ) : (
              <span className="hub-look-preview-logo-empty" aria-hidden>
                {logoFallback}
              </span>
            )}
          </button>
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

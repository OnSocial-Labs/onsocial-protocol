'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { useRef, useState } from 'react';
import { accountIdsEqual } from '@/lib/account-match';
import type { PageAvatarMode, PageHeroSource, PublicPageConfig } from '@/lib/page-data';
import { resolvePageHeroSource } from '@/lib/page-face';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { useApplyProfileMedia } from '@/hooks/use-apply-profile-media';
import { useScrollLock } from '@/hooks/use-scroll-lock';

interface PortfolioCustomizeProps {
  pageAccountId: string;
  config: PublicPageConfig;
}

const AVATAR_OPTIONS: Array<{
  id: PageAvatarMode;
  label: string;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Round avatar over a banner strip.',
  },
  {
    id: 'cover',
    label: 'Cover',
    description: 'Hero media fills the top of the card.',
  },
];

const HERO_SOURCE_OPTIONS: Array<{
  id: PageHeroSource;
  label: string;
  description: string;
}> = [
  {
    id: 'banner',
    label: 'Banner',
    description: 'Use profile banner as the top hero.',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    description: 'Use profile avatar as the top hero.',
  },
  {
    id: 'none',
    label: 'None',
    description: 'Mood gradient only — no hero media.',
  },
];

export function PortfolioCustomize({
  pageAccountId,
  config,
}: PortfolioCustomizeProps) {
  const [open, setOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const {
    committedAvatarMode,
    effectiveAvatarMode,
    isPreviewing,
    setPreviewAvatarMode,
  } = usePortfolioFacePreview();
  const {
    connect,
    error: faceError,
    isApplying: isApplyingFace,
    isOwner,
    needsConnect,
    walletAccountId,
    applyHeroSource,
  } = useApplyPageFace(pageAccountId, config);
  const {
    applyProfileAvatar,
    applyProfileBanner,
    error: mediaError,
    isApplying: isApplyingMedia,
  } = useApplyProfileMedia(pageAccountId);

  const isApplying = isApplyingFace || isApplyingMedia;
  const error = faceError ?? mediaError;
  const savedHeroSource = resolvePageHeroSource(config, committedAvatarMode);
  const effectiveHeroSource = resolvePageHeroSource(config, effectiveAvatarMode);

  useScrollLock(open);

  if (!isOwner) {
    return null;
  }

  function handlePreview(avatarMode: PageAvatarMode) {
    if (avatarMode === effectiveAvatarMode) {
      setOpen(false);
      return;
    }

    setPreviewAvatarMode(avatarMode);
    setOpen(false);
  }

  async function handleAvatarUpload(file: File | null) {
    if (!file) {
      return;
    }

    const saved = await applyProfileAvatar(file);
    if (saved) {
      setOpen(false);
    }
  }

  async function handleBannerUpload(file: File | null) {
    if (!file) {
      return;
    }

    const saved = await applyProfileBanner(file);
    if (saved) {
      setOpen(false);
    }
  }

  async function handleClearBanner() {
    const cleared = await applyProfileBanner(null);
    if (cleared) {
      setOpen(false);
    }
  }

  async function handleHeroSource(next: PageHeroSource) {
    if (next === savedHeroSource) {
      return;
    }

    const saved = await applyHeroSource(next);
    if (saved) {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="portfolio-customize-trigger"
        onClick={() => setOpen(true)}
        aria-label="Customize page"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="portfolio-customize-icon" aria-hidden>
          ≡
        </span>
      </button>

      {open ? (
        <div className="customize-sheet-root" role="presentation">
          <button
            type="button"
            className="customize-sheet-backdrop"
            onClick={() => setOpen(false)}
            aria-label="Close customize"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-sheet-title"
            className="customize-sheet"
          >
            <header className="customize-sheet-header">
              <div>
                <h2 id="customize-sheet-title" className="customize-sheet-title">
                  Customize
                </h2>
                <p className="customize-sheet-copy">
                  Media uploads go to your profile on-chain. Layout picks how
                  they appear on your page.
                </p>
              </div>
              <SheetCloseButton
                onClick={() => setOpen(false)}
                ariaLabel="Close customize"
              />
            </header>

            {needsConnect ? (
              <div className="customize-sheet-actions">
                <p className="customize-sheet-copy">
                  Connect the wallet for @{pageAccountId} to customize this page.
                </p>
                <button
                  type="button"
                  className="customize-sheet-primary"
                  onClick={connect}
                >
                  Connect wallet
                </button>
              </div>
            ) : null}

            {!needsConnect &&
            walletAccountId &&
            !accountIdsEqual(walletAccountId, pageAccountId) ? (
              <div className="customize-sheet-actions">
                <p className="customize-sheet-copy">
                  Connected as @{walletAccountId}. Switch to @{pageAccountId} to
                  customize this page.
                </p>
              </div>
            ) : null}

            {isPreviewing ? (
              <p className="customize-sheet-copy customize-sheet-status">
                Preview active — use Save layout below your page to publish on-chain.
              </p>
            ) : null}

            {error ? <p className="customize-sheet-error">{error}</p> : null}

            <div className="customize-sheet-section">
              <p className="customize-sheet-label">Layout</p>
              <div className="customize-option-list">
                {AVATAR_OPTIONS.map((option) => {
                  const isSelected = option.id === effectiveAvatarMode;
                  const isSaved = option.id === committedAvatarMode;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`customize-option${isSelected ? ' is-active' : ''}`}
                      disabled={isApplying}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => handlePreview(option.id)}
                    >
                      <span className="customize-option-copy">
                        <span className="customize-option-label">
                          {option.label}
                        </span>
                        <span className="customize-option-description">
                          {option.description}
                        </span>
                      </span>
                      {isSelected && isPreviewing && !isSaved ? (
                        <span className="customize-option-badge">Preview</span>
                      ) : isSaved ? (
                        <span className="customize-option-badge">Saved</span>
                      ) : isSelected ? (
                        <span className="customize-option-badge">Active</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="customize-sheet-section">
              <p className="customize-sheet-label">Hero source</p>
              <p className="customize-sheet-copy">
                Currently{' '}
                <strong>{effectiveHeroSource}</strong> for preview. Saved as{' '}
                <strong>{savedHeroSource}</strong>.
              </p>
              <div className="customize-option-list">
                {HERO_SOURCE_OPTIONS.map((option) => {
                  const isSelected = option.id === savedHeroSource;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`customize-option${isSelected ? ' is-active' : ''}`}
                      disabled={isApplying}
                      onClick={() => void handleHeroSource(option.id)}
                    >
                      <span className="customize-option-copy">
                        <span className="customize-option-label">
                          {option.label}
                        </span>
                        <span className="customize-option-description">
                          {option.description}
                        </span>
                      </span>
                      {isSelected ? (
                        <span className="customize-option-badge">Saved</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="customize-sheet-section">
              <p className="customize-sheet-label">Profile media</p>
              <p className="customize-sheet-copy">
                Uploaded via OnSocial storage to your profile. Standard layout
                uses banner; cover layout uses avatar by default.
              </p>
              <div className="customize-media-actions">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="customize-media-input"
                  disabled={isApplying}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleAvatarUpload(file);
                    event.target.value = '';
                  }}
                />
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  className="customize-media-input"
                  disabled={isApplying}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleBannerUpload(file);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="customize-sheet-primary"
                  disabled={isApplying}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  Upload avatar
                </button>
                <button
                  type="button"
                  className="customize-sheet-primary"
                  disabled={isApplying}
                  onClick={() => bannerInputRef.current?.click()}
                >
                  Upload banner / hero video
                </button>
                <button
                  type="button"
                  className="customize-sheet-secondary"
                  disabled={isApplying}
                  onClick={() => void handleClearBanner()}
                >
                  Remove banner
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

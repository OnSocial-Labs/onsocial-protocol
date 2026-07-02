'use client';

import { GlassSheet, ProfileEditorMediaToolbar, SheetCloseButton } from '@onsocial/ui';
import { useRef, useState, useCallback, useEffect } from 'react';
import {
  effectiveMoodTintHue,
  isPageMoodUnlocked,
  PAGE_MOOD_CATALOG,
} from '@onsocial/sdk';
import { MoodSheet } from '@/components/moods/mood-sheet';
import { accountIdsEqual } from '@/lib/account-match';
import type { ResolvedMood } from '@/lib/moods/types';
import { PREMIUM_MOOD_PRESETS as APP_PREMIUM_MOOD_PRESETS } from '@/lib/moods/presets';
import type { PageAvatarMode, PageHeroSource, PublicPageConfig } from '@/lib/page-data';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { useApplyPageMoodTint } from '@/hooks/use-apply-page-mood-tint';
import { useApplyProfileMedia } from '@/hooks/use-apply-profile-media';
import { usePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';

interface PortfolioCustomizeProps {
  pageAccountId: string;
  config: PublicPageConfig;
  mood: ResolvedMood;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

const AVATAR_OPTIONS: Array<{
  id: PageAvatarMode;
  label: string;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Card',
    description: 'Banner with avatar on the dissolve seam.',
  },
  {
    id: 'cover',
    label: 'Cover',
    description: 'Avatar fills an immersive hero band.',
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
    label: 'Minimal',
    description: 'Mood bloom only — no hero media.',
  },
];

export function PortfolioCustomize({
  pageAccountId,
  config,
  mood,
  avatarUrl = null,
  bannerUrl = null,
}: PortfolioCustomizeProps) {
  const [open, setOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const {
    committedAvatarMode,
    committedHeroSource,
    effectiveAvatarMode,
    effectiveHeroSource,
    isPreviewingLayout,
    isPreviewingHeroSource,
    setPreviewAvatarMode,
    setPreviewHeroSource,
  } = usePortfolioFacePreview();
  const {
    connect,
    error: faceError,
    isApplying: isApplyingFace,
    isOwner,
    needsConnect,
    walletAccountId,
  } = useApplyPageFace(pageAccountId, config);
  const {
    applyProfileAvatar,
    applyProfileBanner,
    error: mediaError,
    isApplying: isApplyingMedia,
  } = useApplyProfileMedia(pageAccountId);

  const {
    applyMoodTint,
    error: tintError,
    isApplying: isApplyingTint,
    isOwner: isTintOwner,
  } = useApplyPageMoodTint(pageAccountId);

  const isApplying = isApplyingFace || isApplyingMedia || isApplyingTint;
  const error = faceError ?? mediaError ?? tintError;
  const isCoverLayout = effectiveAvatarMode === 'cover';
  const signaturePreset = APP_PREMIUM_MOOD_PRESETS.signature;
  const signatureUnlocked = isPageMoodUnlocked(
    { moodUnlocks: config.moodUnlocks },
    'signature',
    PAGE_MOOD_CATALOG
  );
  const savedSignatureHue = effectiveMoodTintHue(
    'signature',
    config.theme,
    signaturePreset.theme.accent
  );
  const [draftSignatureHue, setDraftSignatureHue] = useState(savedSignatureHue);
  const draftSignatureHueRef = useRef(savedSignatureHue);
  const customizeApi = usePortfolioCustomize();
  const { moodId: portfolioMoodId, style: portfolioMoodStyle } =
    usePortfolioMoodVars(pageAccountId, walletAccountId ?? '', open);

  useScrollLock(open);

  const openCustomizeSheet = useCallback(() => {
    setDraftSignatureHue(savedSignatureHue);
    draftSignatureHueRef.current = savedSignatureHue;
    setOpen(true);
  }, [savedSignatureHue]);

  useEffect(() => {
    if (!customizeApi || !isOwner) {
      return;
    }

    customizeApi.registerOpen(openCustomizeSheet);
    return () => customizeApi.unregisterOpen();
  }, [customizeApi, isOwner, openCustomizeSheet]);

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

  async function handleAvatarRemove() {
    const saved = await applyProfileAvatar(null);
    if (saved) {
      setOpen(false);
    }
  }

  async function handleBannerRemove() {
    const saved = await applyProfileBanner(null);
    if (saved) {
      setOpen(false);
    }
  }

  function handleHeroSourcePreview(next: PageHeroSource) {
    if (next === effectiveHeroSource && !isPreviewingHeroSource) {
      setOpen(false);
      return;
    }

    setPreviewHeroSource(next);
    setOpen(false);
  }

  function openMoodSheet() {
    setOpen(false);
    setMoodOpen(true);
  }

  async function commitSignatureHue(nextHue: number) {
    if (Math.round(nextHue) === Math.round(savedSignatureHue)) {
      return;
    }

    await applyMoodTint('signature', nextHue);
  }

  function handleSignatureHueInput(nextHue: number) {
    const normalized = ((nextHue % 360) + 360) % 360;
    draftSignatureHueRef.current = normalized;
    setDraftSignatureHue(normalized);
  }

  async function handleSignatureHueCommit() {
    await commitSignatureHue(draftSignatureHueRef.current);
  }

  const showSignatureHue =
    mood.id === 'signature' && signatureUnlocked && isTintOwner && !needsConnect;

  return (
    <>
      <GlassSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="mood-thread"
        moodId={portfolioMoodId ?? mood.id}
        panelStyle={portfolioMoodStyle}
        initialDetent="full"
        zIndex={57}
        ariaLabelledBy="customize-sheet-title"
        backdropLabel="Close customize"
        panelClassName="customize-sheet-panel"
        bodyClassName="customize-sheet-body"
        header={
          <header className="customize-sheet-header">
            <div>
              <h2 id="customize-sheet-title" className="customize-sheet-title">
                Customize
              </h2>
              <p className="customize-sheet-copy">
                Media uploads go to your profile on-chain. Layout picks how they
                appear on your page.
              </p>
            </div>
            <SheetCloseButton
              onClick={() => setOpen(false)}
              ariaLabel="Close customize"
            />
          </header>
        }
      >
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

        {error ? <p className="customize-sheet-error">{error}</p> : null}

        <div className="customize-sheet-section">
              <p className="customize-sheet-label">Mood</p>
              <p className="customize-sheet-copy">
                Your page look and voice — visitors feel it, not a label.
              </p>
              <div className="customize-option-list">
                <button
                  type="button"
                  className="customize-option customize-option--navigate is-active"
                  disabled={isApplying}
                  onClick={openMoodSheet}
                >
                  <span className="customize-option-copy">
                    <span className="customize-option-label">{mood.label}</span>
                    <span className="customize-option-description">
                      {mood.tagline}
                    </span>
                  </span>
                  <span className="customize-option-badge">Change</span>
                </button>
              </div>
            </div>

            {showSignatureHue ? (
              <div className="customize-sheet-section">
                <p className="customize-sheet-label">Ink hue</p>
                <p className="customize-sheet-copy">
                  Your signature ink and mood tint — saved on-chain and kept
                  when you switch moods.
                </p>
                <label className="customize-hue-control">
                  <span className="customize-hue-preview" aria-hidden>
                    <span
                      className="customize-hue-preview-fill"
                      style={{
                        background: `hsl(${draftSignatureHue} 72% 58%)`,
                      }}
                    />
                  </span>
                  <input
                    type="range"
                    className="customize-hue-slider"
                    min={0}
                    max={359}
                    step={1}
                    value={draftSignatureHue}
                    disabled={isApplying}
                    aria-valuetext={`${Math.round(draftSignatureHue)} degrees`}
                    onChange={(event) =>
                      handleSignatureHueInput(Number(event.target.value))
                    }
                    onPointerUp={() => void handleSignatureHueCommit()}
                    onKeyUp={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        void handleSignatureHueCommit();
                      }
                    }}
                  />
                  <span className="customize-hue-value">{Math.round(draftSignatureHue)}°</span>
                </label>
              </div>
            ) : null}

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
                      {isSelected && isPreviewingLayout && !isSaved ? (
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
              {isCoverLayout ? (
                <p className="customize-sheet-copy">
                  Cover layout always uses your avatar as the hero.
                </p>
              ) : (
                <div className="customize-option-list">
                    {HERO_SOURCE_OPTIONS.map((option) => {
                      const isSelected = option.id === effectiveHeroSource;
                      const isSaved = option.id === committedHeroSource;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`customize-option${isSelected ? ' is-active' : ''}`}
                          disabled={isApplying}
                          aria-current={isSelected ? 'true' : undefined}
                          onClick={() => handleHeroSourcePreview(option.id)}
                        >
                          <span className="customize-option-copy">
                            <span className="customize-option-label">
                              {option.label}
                            </span>
                            <span className="customize-option-description">
                              {option.description}
                            </span>
                          </span>
                          {isSelected && isPreviewingHeroSource && !isSaved ? (
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
              )}
            </div>

            <div className="customize-sheet-section">
              <p className="customize-sheet-label">Profile media</p>
              <p className="customize-sheet-copy">
                Uploaded via OnSocial storage to your profile. Card layout uses
                banner; cover layout uses avatar by default.
              </p>
              <div className="profile-editor-media-compact-row">
                <div
                  className={`profile-editor-media-host profile-editor-media-host--compact-avatar profile-editor-media-host--circle${avatarUrl ? ' has-media' : ''}`}
                >
                  <button
                    type="button"
                    className="profile-editor-media-backdrop"
                    disabled={isApplying}
                    aria-label="Upload avatar"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="profile-editor-media-empty-fill" aria-hidden />
                    )}
                    <span
                      className={`profile-editor-media-overlay${avatarUrl ? ' has-media' : ''}`}
                      aria-hidden
                    />
                  </button>
                  <ProfileEditorMediaToolbar
                    layout="avatar"
                    removeLabel={avatarUrl ? 'Remove avatar' : undefined}
                    onRemove={avatarUrl ? () => void handleAvatarRemove() : undefined}
                  />
                </div>
                <div className="profile-editor-media-compact-copy">
                  <p className="profile-editor-media-compact-label">Avatar</p>
                  <p className="profile-editor-media-compact-hint">512&times;512 recommended.</p>
                  <div
                    className={`profile-editor-media-host profile-editor-media-host--compact-banner${bannerUrl ? ' has-media' : ''}`}
                  >
                    <button
                      type="button"
                      className="profile-editor-media-backdrop"
                      disabled={isApplying}
                      aria-label="Upload banner"
                      onClick={() => bannerInputRef.current?.click()}
                    >
                      {bannerUrl ? (
                        <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="profile-editor-media-empty-fill" aria-hidden />
                      )}
                      <span
                        className={`profile-editor-media-overlay${bannerUrl ? ' has-media' : ''}`}
                        aria-hidden
                      />
                    </button>
                    <ProfileEditorMediaToolbar
                      layout="banner"
                      removeLabel={bannerUrl ? 'Remove banner' : undefined}
                      onRemove={bannerUrl ? () => void handleBannerRemove() : undefined}
                    />
                  </div>
                  <p className="profile-editor-media-compact-hint">
                    1500&times;300 or short hero video.
                  </p>
                </div>
              </div>
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
            </div>
      </GlassSheet>

      <MoodSheet
        open={moodOpen}
        pageAccountId={pageAccountId}
        pageConfig={config}
        activeMood={mood}
        onClose={() => setMoodOpen(false)}
      />
    </>
  );
}

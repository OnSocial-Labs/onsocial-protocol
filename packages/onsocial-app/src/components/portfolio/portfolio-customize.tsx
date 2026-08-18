'use client';

import {
  Divider,
  GlassSheet,
  ProfileEditorMediaToolbar,
  SheetCloseButton,
  useScrollLock,
} from '@onsocial/ui';
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
} from 'react';
import {
  effectiveMoodTintHue,
  isPageMoodUnlocked,
  PAGE_MOOD_CATALOG,
  resolvePageMoodId,
} from '@onsocial/sdk';
import { MoodSheet } from '@/components/moods/mood-sheet';
import { accountIdsEqual } from '@/lib/account-match';
import type { ResolvedMood } from '@/lib/moods/types';
import { PREMIUM_MOOD_PRESETS as APP_PREMIUM_MOOD_PRESETS } from '@/lib/moods/presets';
import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
  ResolvedPageHeroKind,
} from '@/lib/page-data';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { useApplyPageMoodTint } from '@/hooks/use-apply-page-mood-tint';
import { useApplyProfileMedia } from '@/hooks/use-apply-profile-media';
import { useApplyPageLaunch } from '@/hooks/use-apply-page-launch';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { usePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { usePortfolioPostPeeks } from '@/contexts/portfolio-post-peeks-context';
import { usePortfolioShelf } from '@/contexts/portfolio-shelf-context';
import { CustomizeLaunchChapters } from '@/components/portfolio/customize-launch-chapters';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';

interface PortfolioCustomizeProps {
  pageAccountId: string;
  config: PublicPageConfig;
  mood: ResolvedMood;
  isDao?: boolean;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bannerKind?: ResolvedPageHeroKind | null;
  profileLinks?: unknown;
  guilds?: ProfileGuildSummary[];
}

const AVATAR_OPTIONS: Array<{
  id: PageAvatarMode;
  label: string;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Card',
    description: 'Classic banner with your avatar in front.',
  },
  {
    id: 'cover',
    label: 'Cover',
    description: 'A bold hero built from your avatar.',
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
    description: 'Use your profile banner at the top.',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    description: 'Use your avatar as the top hero.',
  },
  {
    id: 'none',
    label: 'Minimal',
    description: 'Let the mood carry the page.',
  },
];

export function PortfolioCustomize({
  pageAccountId,
  config,
  mood,
  isDao = false,
  avatarUrl = null,
  bannerUrl = null,
  bannerKind = null,
  profileLinks = null,
  guilds = [],
}: PortfolioCustomizeProps) {
  const [open, setOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const { postPeeks } = usePortfolioPostPeeks();
  const shelf = usePortfolioShelf();
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
    isOwner: isAccountOwner,
    needsConnect,
    walletAccountId,
  } = useApplyPageFace(pageAccountId, config);
  const { canPropose } = useDaoPageCapability(pageAccountId, isDao);
  const canEditMood = isAccountOwner || canPropose;
  const canCustomizeFace = isAccountOwner;
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

  const {
    applyLaunchPatch,
    error: launchError,
    isApplying: isApplyingLaunch,
  } = useApplyPageLaunch(pageAccountId, config);

  const isApplying =
    isApplyingFace || isApplyingMedia || isApplyingTint || isApplyingLaunch;
  const error = faceError ?? mediaError ?? tintError ?? launchError;
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
  const { registerMoodSheetOpen, unregisterMoodSheetOpen } =
    usePortfolioMoodPreview();
  const { moodId: portfolioMoodId, style: portfolioMoodStyle } =
    usePortfolioMoodVars(pageAccountId, walletAccountId ?? '', open);
  const moodAccent =
    mood.cssVars['--mood-accent-chrome'] ??
    mood.cssVars['--mood-preset-accent'] ??
    mood.cssVars['--mood-accent'];
  const customizePanelStyle = {
    ...mood.cssVars,
    ...portfolioMoodStyle,
    ...(moodAccent
      ? {
          '--glass-sheet-accent': moodAccent,
          '--mood-accent': moodAccent,
          '--mood-accent-chrome': moodAccent,
        }
      : {}),
  } as CSSProperties;

  useScrollLock(open);

  const openCustomizeSheet = useCallback(() => {
    setDraftSignatureHue(savedSignatureHue);
    draftSignatureHueRef.current = savedSignatureHue;
    setOpen(true);
  }, [savedSignatureHue]);

  const openMoodSheet = useCallback(() => {
    setOpen(false);
    setMoodOpen(true);
  }, []);

  useEffect(() => {
    if (!customizeApi || !canCustomizeFace) {
      return;
    }

    customizeApi.registerOpen(openCustomizeSheet);
    return () => customizeApi.unregisterOpen();
  }, [customizeApi, canCustomizeFace, openCustomizeSheet]);

  useEffect(() => {
    if (!canEditMood) {
      return;
    }

    registerMoodSheetOpen(openMoodSheet);
    return () => unregisterMoodSheetOpen();
  }, [canEditMood, openMoodSheet, registerMoodSheetOpen, unregisterMoodSheetOpen]);

  if (!canEditMood) {
    return null;
  }

  if (!canCustomizeFace) {
    return (
      <MoodSheet
        open={moodOpen}
        pageAccountId={pageAccountId}
        pageConfig={config}
        activeMood={mood}
        isDao={isDao}
        onClose={() => setMoodOpen(false)}
      />
    );
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
    mood.id === 'signature' &&
    signatureUnlocked &&
    isTintOwner &&
    !needsConnect;
  const moodPageId = resolvePageMoodId(String(mood.id)) ?? 'protocol';

  return (
    <>
      <GlassSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="mood-thread"
        sizing="hug"
        moodId={portfolioMoodId ?? mood.id}
        panelStyle={customizePanelStyle}
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
                Tune mood, Launch chapters, layout, and media for this page.
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

        {!needsConnect &&
        walletAccountId &&
        accountIdsEqual(walletAccountId, pageAccountId) ? (
          <>
            <div className="customize-sheet-section">
              <CustomizeLaunchChapters
                pageAccountId={pageAccountId}
                config={config}
                profileLinks={profileLinks}
                guilds={guilds}
                postPeeks={postPeeks}
                createdPeeks={shelf.createdPeeks}
                storeShelf={shelf.storeShelf}
                disabled={isApplying}
                onSave={applyLaunchPatch}
              />
            </div>
            <Divider variant="section" className="customize-sheet-divider" />
          </>
        ) : null}

        <div className="customize-sheet-section">
          <p className="customize-sheet-label">Mood</p>
          <p className="customize-sheet-copy">
            Choose the page atmosphere. Preview it, then save.
          </p>
          <div className="os-surface-row-list">
            <button
              type="button"
              data-mood={moodPageId}
              className="mood-sheet-item customize-mood-option is-active is-selectable"
              style={mood.cssVars as CSSProperties}
              disabled={isApplying}
              onClick={openMoodSheet}
            >
              <span className="os-surface-row-badge">Change</span>
              <span className="customize-mood-option-copy">
                <span className="mood-sheet-item-label">{mood.label}</span>
                <span className="mood-sheet-item-tagline">{mood.tagline}</span>
              </span>
            </button>
          </div>
        </div>

        {showSignatureHue ? (
          <>
            <Divider variant="section" className="customize-sheet-divider" />
            <div className="customize-sheet-section">
              <p className="customize-sheet-label">Ink hue</p>
              <p className="customize-sheet-copy">
                Tune your signature accent. It stays with this mood.
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
                <span className="customize-hue-value">
                  {Math.round(draftSignatureHue)}°
                </span>
              </label>
            </div>
          </>
        ) : null}

        <Divider variant="section" className="customize-sheet-divider" />
        <div className="customize-sheet-section">
          <p className="customize-sheet-label">Layout</p>
          <div className="os-surface-row-list">
            {AVATAR_OPTIONS.map((option) => {
              const isSelected = option.id === effectiveAvatarMode;
              const isSaved = option.id === committedAvatarMode;

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`os-surface-row${isSelected ? ' is-active' : ''}`}
                  disabled={isApplying}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => handlePreview(option.id)}
                >
                  <span className="os-surface-row-copy">
                    <span className="os-surface-row-label">{option.label}</span>
                    <span className="os-surface-row-description">
                      {option.description}
                    </span>
                  </span>
                  {isSelected && isPreviewingLayout && !isSaved ? (
                    <span className="os-surface-row-badge">Preview</span>
                  ) : isSaved ? (
                    <span className="os-surface-row-badge">Saved</span>
                  ) : isSelected ? (
                    <span className="os-surface-row-badge">Active</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <Divider variant="section" className="customize-sheet-divider" />
        <div className="customize-sheet-section">
          <p className="customize-sheet-label">Hero source</p>
          {isCoverLayout ? (
            <p className="customize-sheet-copy">
              Cover layout always uses your avatar as the hero.
            </p>
          ) : (
            <div className="os-surface-row-list">
              {HERO_SOURCE_OPTIONS.map((option) => {
                const isSelected = option.id === effectiveHeroSource;
                const isSaved = option.id === committedHeroSource;

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`os-surface-row${isSelected ? ' is-active' : ''}`}
                    disabled={isApplying}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => handleHeroSourcePreview(option.id)}
                  >
                    <span className="os-surface-row-copy">
                      <span className="os-surface-row-label">
                        {option.label}
                      </span>
                      <span className="os-surface-row-description">
                        {option.description}
                      </span>
                    </span>
                    {isSelected && isPreviewingHeroSource && !isSaved ? (
                      <span className="os-surface-row-badge">Preview</span>
                    ) : isSaved ? (
                      <span className="os-surface-row-badge">Saved</span>
                    ) : isSelected ? (
                      <span className="os-surface-row-badge">Active</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Divider variant="section" className="customize-sheet-divider" />
        <div className="customize-sheet-section">
          <p className="customize-sheet-label">Profile media</p>
          <p className="customize-sheet-copy">
            Update the avatar and banner used across layouts.
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
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="profile-editor-media-empty-fill"
                    aria-hidden
                  />
                )}
                <span
                  className={`profile-editor-media-overlay${avatarUrl ? ' has-media' : ''}`}
                  aria-hidden
                />
              </button>
              <ProfileEditorMediaToolbar
                layout="avatar"
                removeLabel={avatarUrl ? 'Remove avatar' : undefined}
                onRemove={
                  avatarUrl ? () => void handleAvatarRemove() : undefined
                }
              />
            </div>
            <div className="profile-editor-media-compact-copy">
              <p className="profile-editor-media-compact-label">Avatar</p>
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
                  {bannerUrl && bannerKind === 'video' ? (
                    <video
                      src={bannerUrl}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      autoPlay
                      aria-hidden
                    />
                  ) : bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="profile-editor-media-empty-fill"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`profile-editor-media-overlay${bannerUrl ? ' has-media' : ''}`}
                    aria-hidden
                  />
                </button>
                <ProfileEditorMediaToolbar
                  layout="banner"
                  removeLabel={bannerUrl ? 'Remove banner' : undefined}
                  onRemove={
                    bannerUrl ? () => void handleBannerRemove() : undefined
                  }
                />
              </div>
              <p className="profile-editor-media-compact-hint">
                Photo or video
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
        isDao={isDao}
        onClose={() => setMoodOpen(false)}
      />
    </>
  );
}

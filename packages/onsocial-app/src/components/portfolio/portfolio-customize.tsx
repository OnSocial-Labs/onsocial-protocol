'use client';

import { Divider, GlassSheet, SheetHeader, useScrollLock } from '@onsocial/ui';
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
import {
  CUSTOMIZE_CONNECT_CTA,
  CUSTOMIZE_CONNECT_HINT,
} from '@/components/portfolio/customize-connect-voice';
import { accountIdsEqual } from '@/lib/account-match';
import type { ResolvedMood } from '@/lib/moods/types';
import { PREMIUM_MOOD_PRESETS as APP_PREMIUM_MOOD_PRESETS } from '@/lib/moods/presets';
import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
} from '@/lib/page-data';
import { SHEET_Z } from '@/lib/sheet-z';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { PortfolioCustomizeBook } from '@/components/portfolio/portfolio-customize-book';
import { PortfolioCustomizeSong } from '@/components/portfolio/portfolio-customize-song';
import {
  readPinnedBookId,
  readPinnedSongId,
  readPinnedSongStart,
} from '@/lib/page-face';
import { useApplyPageMoodTint } from '@/hooks/use-apply-page-mood-tint';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { usePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';

interface PortfolioCustomizeProps {
  pageAccountId: string;
  config: PublicPageConfig;
  mood: ResolvedMood;
  isDao?: boolean;
}

const AVATAR_OPTIONS: Array<{
  id: PageAvatarMode;
  label: string;
}> = [
  { id: 'standard', label: 'Card' },
  { id: 'cover', label: 'Cover' },
];

const HERO_SOURCE_OPTIONS: Array<{
  id: PageHeroSource;
  label: string;
}> = [
  { id: 'banner', label: 'Banner' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'none', label: 'Minimal' },
];

export function PortfolioCustomize({
  pageAccountId,
  config,
  mood,
  isDao = false,
}: PortfolioCustomizeProps) {
  const [open, setOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const {
    effectiveAvatarMode,
    effectiveHeroSource,
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
    applyPinnedBook,
    applyPinnedSong,
  } = useApplyPageFace(pageAccountId, config);
  const { canPropose } = useDaoPageCapability(pageAccountId, isDao);
  const canEditMood = isAccountOwner || canPropose;
  const canCustomizeFace = isAccountOwner;

  const {
    applyMoodTint,
    error: tintError,
    isApplying: isApplyingTint,
    isOwner: isTintOwner,
  } = useApplyPageMoodTint(pageAccountId);

  const isApplying = isApplyingFace || isApplyingTint;
  const error = faceError ?? tintError;
  const isCoverLayout = effectiveAvatarMode === 'cover';
  const controlsLocked =
    needsConnect ||
    Boolean(
      walletAccountId && !accountIdsEqual(walletAccountId, pageAccountId)
    );
  const controlsDisabled = isApplying || controlsLocked;
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
    // DAO faces register before council eligibility resolves so Manage →
    // Propose mood is not a silent no-op while capability is still loading.
    if (!isDao && !canEditMood) {
      return;
    }

    registerMoodSheetOpen(openMoodSheet);
    return () => unregisterMoodSheetOpen();
  }, [
    canEditMood,
    isDao,
    openMoodSheet,
    registerMoodSheetOpen,
    unregisterMoodSheetOpen,
  ]);

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
        zIndex={SHEET_Z.facts}
        ariaLabelledBy="customize-sheet-title"
        backdropLabel="Close customize"
        panelClassName="customize-sheet-panel os-sheet-cap-standard"
        bodyClassName="customize-sheet-body os-hug-sheet-body"
        header={
          <SheetHeader
            titleId="customize-sheet-title"
            title="Customize"
            onClose={() => setOpen(false)}
            closeAriaLabel="Close customize"
          />
        }
      >
        {needsConnect ? (
          <div className="customize-sheet-actions">
            <p className="customize-sheet-copy">{CUSTOMIZE_CONNECT_HINT}</p>
            <button
              type="button"
              className="customize-sheet-primary"
              onClick={connect}
            >
              {CUSTOMIZE_CONNECT_CTA}
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
          <div className="os-surface-row-list">
            <button
              type="button"
              data-mood={moodPageId}
              className="mood-sheet-item customize-mood-option is-active is-selectable"
              style={mood.cssVars as CSSProperties}
              disabled={controlsDisabled}
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
                  disabled={controlsDisabled}
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
          <div
            className="app-storage-mode-toggle"
            role="group"
            aria-label="Layout"
          >
            {AVATAR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`app-storage-mode${
                  option.id === effectiveAvatarMode ? ' is-active' : ''
                }`}
                disabled={controlsDisabled}
                aria-pressed={option.id === effectiveAvatarMode}
                onClick={() => handlePreview(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Divider variant="section" className="customize-sheet-divider" />
        <div className="customize-sheet-section">
          <p className="customize-sheet-label">Hero</p>
          {isCoverLayout ? (
            <p className="customize-sheet-copy customize-sheet-copy--inline">
              Cover uses your avatar.
            </p>
          ) : (
            <div
              className="app-storage-mode-toggle"
              role="group"
              aria-label="Hero source"
            >
              {HERO_SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`app-storage-mode${
                    option.id === effectiveHeroSource ? ' is-active' : ''
                  }`}
                  disabled={controlsDisabled}
                  aria-pressed={option.id === effectiveHeroSource}
                  onClick={() => handleHeroSourcePreview(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {canCustomizeFace ? (
          <PortfolioCustomizeSong
            key={pageAccountId}
            accountId={pageAccountId}
            songId={readPinnedSongId(config)}
            songStart={readPinnedSongStart(config)}
            disabled={controlsDisabled}
            note={faceError}
            onSave={(next, start) => applyPinnedSong(next, start)}
          />
        ) : null}

        {canCustomizeFace ? (
          <PortfolioCustomizeBook
            key={`${pageAccountId}-book`}
            accountId={pageAccountId}
            bookId={readPinnedBookId(config)}
            disabled={controlsDisabled}
            note={faceError}
            onSave={(next) => applyPinnedBook(next)}
          />
        ) : null}
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

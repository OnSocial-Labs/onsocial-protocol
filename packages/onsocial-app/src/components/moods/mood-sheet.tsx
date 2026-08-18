'use client';

import { useEffect, type CSSProperties } from 'react';
import {
  isPageMoodUnlocked,
  PAGE_MOOD_CATALOG,
  type PageMoodId,
} from '@onsocial/sdk';
import {
  Divider,
  GlassSheet,
  SheetCloseButton,
  useScrollLock,
} from '@onsocial/ui';
import { useApplyMood } from '@/hooks/use-apply-mood';
import { useUnlockPremiumMood } from '@/hooks/use-unlock-premium-mood';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { accountIdsEqual } from '@/lib/account-match';
import {
  moodSheetPanelStyle,
  moodSheetRowInlineStyle,
  moodSheetRowPreviewVars,
} from '@/lib/moods/resolve';
import {
  MOOD_PRESETS,
  PAGE_MOOD_CATALOG as APP_MOOD_CATALOG,
  PAGE_MOOD_PICKER_SECTIONS,
  PAGE_MOOD_PICKER_STORE_SECTIONS,
  PREMIUM_MOOD_PRESETS,
  visiblePremiumMoodIds,
} from '@/lib/moods/presets';
import type { MoodPreset, ResolvedMood } from '@/lib/moods/types';
import type { PublicPageConfig } from '@/lib/page-data';
import type { PageConfig } from '@onsocial/sdk';

export interface MoodSheetProps {
  open: boolean;
  pageAccountId: string;
  pageConfig: PublicPageConfig;
  activeMood: ResolvedMood;
  isDao?: boolean;
  onClose: () => void;
}

export function MoodSheet({
  open,
  pageAccountId,
  pageConfig,
  activeMood,
  isDao = false,
  onClose,
}: MoodSheetProps) {
  const { setPreviewMood, registerMoodSheetClose, unregisterMoodSheetClose } =
    usePortfolioMoodPreview();
  const {
    connect,
    isApplying,
    isOwner,
    isAccountOwner,
    needsConnect,
    walletAccountId,
  } = useApplyMood(pageAccountId, { isDao });
  const { isUnlocking } = useUnlockPremiumMood(pageAccountId);
  const proposeOnly = isDao && isOwner && !isAccountOwner;

  useScrollLock(open);

  useEffect(() => {
    if (!open) {
      return;
    }

    registerMoodSheetClose(onClose);
    return () => unregisterMoodSheetClose();
  }, [open, onClose, registerMoodSheetClose, unregisterMoodSheetClose]);

  const premiumIds = visiblePremiumMoodIds();

  const pageConfigForUnlock: Pick<PageConfig, 'moodUnlocks'> = {
    moodUnlocks: pageConfig.moodUnlocks,
  };

  function handlePreviewMood(moodId: PageMoodId) {
    setPreviewMood(moodId);
    onClose();
  }

  function renderMoodRow(moodId: PageMoodId, preset: MoodPreset) {
    const isActive = preset.id === activeMood.id;
    const unlocked = isPageMoodUnlocked(
      pageConfigForUnlock,
      moodId,
      PAGE_MOOD_CATALOG
    );
    const catalogEntry = APP_MOOD_CATALOG[moodId];
    const priceSocial = catalogEntry?.priceSocial;
    const rowStyle = moodSheetRowInlineStyle(
      isActive
        ? {}
        : moodSheetRowPreviewVars(preset.id, preset.theme, pageConfig.theme),
      preset.theme.accent,
      preset.theme.accentLight ?? preset.theme.accent
    );

    return (
      <li key={preset.id}>
        <button
          type="button"
          data-mood={preset.id}
          className={`mood-sheet-item${isActive ? ' is-active' : ''}${isOwner ? ' is-selectable' : ''}${!unlocked ? ' is-locked' : ''}`}
          disabled={
            !isOwner ||
            isApplying ||
            isUnlocking ||
            isActive ||
            (!unlocked && !isAccountOwner)
          }
          aria-current={isActive ? 'true' : undefined}
          onClick={() => {
            if (!isOwner || isActive) {
              return;
            }
            handlePreviewMood(preset.id);
          }}
          style={rowStyle as CSSProperties}
        >
          <span className="mood-sheet-item-label">{preset.label}</span>
          <span className="mood-sheet-item-tagline">{preset.tagline}</span>
          {isActive ? (
            <span className="mood-sheet-item-badge">Active</span>
          ) : !unlocked && priceSocial ? (
            <span className="mood-sheet-item-badge mood-sheet-item-badge-premium">
              {priceSocial} SOCIAL
            </span>
          ) : null}
        </button>
      </li>
    );
  }

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="mood-thread"
      sizing="hug"
      moodId={activeMood.id}
      panelStyle={moodSheetPanelStyle(activeMood.cssVars) as CSSProperties}
      initialDetent="full"
      zIndex={58}
      ariaLabelledBy="mood-sheet-title"
      backdropLabel="Close moods"
      panelClassName="mood-sheet-panel"
      bodyClassName="mood-sheet-body"
      header={
        <>
          <header className="mood-sheet-header">
            <div>
              <h2 id="mood-sheet-title" className="mood-sheet-title">
                {proposeOnly ? 'Propose mood' : 'Moods'}
              </h2>
              <p className="mood-sheet-copy">
                {proposeOnly
                  ? 'Preview a mood, then propose it for council approval.'
                  : 'Choose a page mood. We preview it first, then you save it.'}
              </p>
            </div>
            <SheetCloseButton onClick={onClose} ariaLabel="Close moods" />
          </header>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {needsConnect ? (
        <div className="mood-sheet-actions">
          <p className="mood-sheet-copy">
            {isDao
              ? 'Connect a council wallet with propose rights to set this DAO mood.'
              : `Connect the wallet for @${pageAccountId} to apply a mood.`}
          </p>
          <button
            type="button"
            className="mood-sheet-primary"
            onClick={() => void connect()}
          >
            Connect wallet
          </button>
        </div>
      ) : null}

      {!needsConnect &&
      walletAccountId &&
      !isOwner &&
      !accountIdsEqual(walletAccountId, pageAccountId) ? (
        <div className="mood-sheet-actions">
          <p className="mood-sheet-copy">
            {isDao
              ? `Connected as @${walletAccountId}. You need council propose rights on this DAO.`
              : `Connected as @${walletAccountId}. Switch to @${pageAccountId} to apply moods here.`}
          </p>
        </div>
      ) : null}

      <ul className="mood-sheet-list">
        {PAGE_MOOD_PICKER_SECTIONS.map((section) => (
          <li key={section.title ?? 'protocol'} className="mood-sheet-section">
            {section.title ? (
              <p className="mood-sheet-section-title">{section.title}</p>
            ) : null}
            <ul className="mood-sheet-section-list">
              {section.ids.map((moodId) =>
                renderMoodRow(moodId, MOOD_PRESETS[moodId])
              )}
            </ul>
          </li>
        ))}

        {PAGE_MOOD_PICKER_STORE_SECTIONS.map((section) => {
          const sectionIds = section.ids.filter((id) =>
            premiumIds.includes(id)
          );
          if (sectionIds.length === 0) {
            return null;
          }

          return (
            <li key={section.title} className="mood-sheet-section">
              <p className="mood-sheet-section-title">{section.title}</p>
              <ul className="mood-sheet-section-list">
                {sectionIds.map((moodId) =>
                  renderMoodRow(moodId, PREMIUM_MOOD_PRESETS[moodId])
                )}
              </ul>
            </li>
          );
        })}
      </ul>
    </GlassSheet>
  );
}

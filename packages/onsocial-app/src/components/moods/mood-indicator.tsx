'use client';

import { useState, type CSSProperties } from 'react';
import {
  isPageMoodUnlocked,
  PAGE_MOOD_CATALOG,
  type PageMoodId,
  type PremiumPageMoodId,
} from '@onsocial/sdk';
import { SheetCloseButton } from '@onsocial/ui';
import { useApplyMood } from '@/hooks/use-apply-mood';
import { useUnlockPremiumMood } from '@/hooks/use-unlock-premium-mood';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { accountIdsEqual } from '@/lib/account-match';
import { moodSheetItemPreviewVars } from '@/lib/moods/resolve';
import {
  MOOD_PRESETS,
  PAGE_MOOD_CATALOG as APP_MOOD_CATALOG,
  PAGE_MOOD_PICKER_SECTIONS,
  PAGE_MOOD_PICKER_STORE_SECTIONS,
  PREMIUM_MOOD_PRESETS,
  visiblePremiumMoodIds,
} from '@/lib/moods/presets';
import type { MoodId, MoodPreset, ResolvedMood } from '@/lib/moods/types';
import type { PublicPageConfig } from '@/lib/page-data';
import type { PageConfig } from '@onsocial/sdk';

interface MoodSheetProps {
  open: boolean;
  pageAccountId: string;
  pageConfig: PublicPageConfig;
  activeMood: ResolvedMood;
  onClose: () => void;
}

function MoodSheet({
  open,
  pageAccountId,
  pageConfig,
  activeMood,
  onClose,
}: MoodSheetProps) {
  const { applyMood, connect, error, isApplying, isOwner, needsConnect, walletAccountId } =
    useApplyMood(pageAccountId);
  const {
    unlockMood,
    error: unlockError,
    isUnlocking,
  } = useUnlockPremiumMood(pageAccountId);
  const [pendingId, setPendingId] = useState<MoodId | null>(null);
  const [pendingUnlockId, setPendingUnlockId] = useState<PremiumPageMoodId | null>(
    null
  );

  useScrollLock(open);

  if (!open) {
    return null;
  }

  const premiumIds = visiblePremiumMoodIds();
  const statusError = error ?? unlockError;

  const pageConfigForUnlock: Pick<PageConfig, 'moodUnlocks'> = {
    moodUnlocks: pageConfig.moodUnlocks,
  };

  async function handleSelect(moodId: PageMoodId) {
    if (!isOwner || isApplying || isUnlocking || moodId === activeMood.id) {
      return;
    }

    if (
      !isPageMoodUnlocked(pageConfigForUnlock, moodId, PAGE_MOOD_CATALOG)
    ) {
      return;
    }

    setPendingId(moodId);
    const applied = await applyMood(moodId);
    setPendingId(null);

    if (applied) {
      onClose();
    }
  }

  async function handleUnlock(moodId: PremiumPageMoodId) {
    if (!isOwner || isApplying || isUnlocking) {
      return;
    }

    setPendingUnlockId(moodId);
    const unlocked = await unlockMood(moodId);
    setPendingUnlockId(null);

    if (unlocked) {
      onClose();
    }
  }

  function renderMoodRow(moodId: PageMoodId, preset: MoodPreset) {
    const isActive = preset.id === activeMood.id;
    const isPending = pendingId === preset.id;
    const unlocked = isPageMoodUnlocked(
      pageConfigForUnlock,
      moodId,
      PAGE_MOOD_CATALOG
    );
    const catalogEntry = APP_MOOD_CATALOG[moodId];
    const priceSocial = catalogEntry?.priceSocial;

    return (
      <li key={preset.id}>
        <button
          type="button"
          data-mood={preset.id}
          className={`mood-sheet-item${isActive ? ' is-active' : ''}${isOwner && unlocked ? ' is-selectable' : ''}${!unlocked ? ' is-locked' : ''}`}
          disabled={!isOwner || isApplying || isUnlocking || (unlocked && isActive)}
          aria-current={isActive ? 'true' : undefined}
          onClick={() => {
            if (!unlocked && isPremiumMoodRow(moodId)) {
              void handleUnlock(moodId);
              return;
            }
            void handleSelect(moodId);
          }}
          style={
            moodSheetItemPreviewVars(preset.id, preset.theme) as CSSProperties
          }
        >
          <span className="mood-sheet-item-label">{preset.label}</span>
          <span className="mood-sheet-item-tagline">{preset.tagline}</span>
          {isActive ? (
            <span className="mood-sheet-item-badge">Active</span>
          ) : isPending ? (
            <span className="mood-sheet-item-badge">Applying…</span>
          ) : pendingUnlockId === moodId ? (
            <span className="mood-sheet-item-badge">Unlocking…</span>
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
    <div className="mood-sheet-root" role="presentation">
      <button
        type="button"
        className="mood-sheet-backdrop"
        onClick={onClose}
        aria-label="Close moods"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-sheet-title"
        className="mood-sheet"
      >
        <header className="mood-sheet-header">
          <div>
            <h2 id="mood-sheet-title" className="mood-sheet-title">
              Moods
            </h2>
            <p className="mood-sheet-copy">
              {isOwner
                ? 'Apply a mood to your page on-chain — theme and signal together.'
                : 'How this account is showing up right now.'}
            </p>
          </div>
          <SheetCloseButton onClick={onClose} ariaLabel="Close moods" />
        </header>

        {needsConnect ? (
          <div className="mood-sheet-actions">
            <p className="mood-sheet-copy">
              Connect the wallet for @{pageAccountId} to apply a mood.
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

        {!needsConnect && walletAccountId && !accountIdsEqual(walletAccountId, pageAccountId) ? (
          <div className="mood-sheet-actions">
            <p className="mood-sheet-copy">
              Connected as @{walletAccountId}. Switch to @{pageAccountId} to
              apply moods here.
            </p>
          </div>
        ) : null}

        {isApplying || isUnlocking ? (
          <p className="mood-sheet-copy mood-sheet-status">
            {isUnlocking ? 'Confirming unlock on-chain…' : 'Confirming mood on-chain…'}
          </p>
        ) : null}

        {statusError ? <p className="mood-sheet-error">{statusError}</p> : null}

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
            const sectionIds = section.ids.filter((id) => premiumIds.includes(id));
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
      </section>
    </div>
  );
}

function isPremiumMoodRow(moodId: PageMoodId): moodId is PremiumPageMoodId {
  return moodId in PREMIUM_MOOD_PRESETS;
}

interface MoodIndicatorProps {
  pageAccountId: string;
  pageConfig: PublicPageConfig;
  mood: ResolvedMood;
  compact?: boolean;
}

export function MoodIndicator({
  pageAccountId,
  pageConfig,
  mood,
  compact = false,
}: MoodIndicatorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`mood-indicator${compact ? ' mood-indicator-compact' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="mood-indicator-dot" aria-hidden="true" />
        <span>{mood.label}</span>
        {!compact && mood.note ? (
          <span className="mood-indicator-note">· {mood.note}</span>
        ) : null}
      </button>

      <MoodSheet
        open={open}
        pageAccountId={pageAccountId}
        pageConfig={pageConfig}
        activeMood={mood}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

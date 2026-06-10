'use client';

import { useState } from 'react';
import { useApplyMood } from '@/hooks/use-apply-mood';
import { MOOD_PRESET_LIST } from '@/lib/moods/presets';
import type { BuiltInMoodId } from '@/lib/moods/types';
import type { ResolvedMood } from '@/lib/moods/types';

interface MoodSheetProps {
  open: boolean;
  pageAccountId: string;
  activeMood: ResolvedMood;
  onClose: () => void;
}

function MoodSheet({
  open,
  pageAccountId,
  activeMood,
  onClose,
}: MoodSheetProps) {
  const { applyMood, connect, error, isApplying, isOwner, needsConnect, walletAccountId } =
    useApplyMood(pageAccountId);
  const [pendingId, setPendingId] = useState<BuiltInMoodId | null>(null);

  if (!open) {
    return null;
  }

  async function handleSelect(moodId: BuiltInMoodId) {
    if (!isOwner || isApplying || moodId === activeMood.id) {
      return;
    }

    setPendingId(moodId);
    await applyMood(moodId);
    setPendingId(null);
    onClose();
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
        className="mood-sheet animate-rise-in"
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
          <button
            type="button"
            className="mood-sheet-close"
            onClick={onClose}
            aria-label="Close moods"
          >
            ×
          </button>
        </header>

        {needsConnect ? (
          <div className="mood-sheet-actions">
            <p className="mood-sheet-copy">
              Connect the wallet for @{pageAccountId} to apply a mood.
            </p>
            <button type="button" className="mood-sheet-primary" onClick={connect}>
              Connect wallet
            </button>
          </div>
        ) : null}

        {!needsConnect && walletAccountId && walletAccountId !== pageAccountId ? (
          <div className="mood-sheet-actions">
            <p className="mood-sheet-copy">
              Connected as @{walletAccountId}. Switch to @{pageAccountId} to
              apply moods here.
            </p>
          </div>
        ) : null}

        {error ? <p className="mood-sheet-error">{error}</p> : null}

        <ul className="mood-sheet-list">
          {MOOD_PRESET_LIST.map((preset) => {
            const isActive = preset.id === activeMood.id;
            const isPending = pendingId === preset.id;

            return (
              <li key={preset.id}>
                <button
                  type="button"
                  className={`mood-sheet-item${isActive ? ' is-active' : ''}${isOwner ? ' is-selectable' : ''}`}
                  disabled={!isOwner || isApplying}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => void handleSelect(preset.id)}
                  style={Object.fromEntries(
                    Object.entries({
                      '--mood-bg': preset.theme.background,
                      '--mood-accent': preset.theme.accent,
                      '--mood-surface': preset.theme.surface,
                    })
                  )}
                >
                  <span className="mood-sheet-item-label">{preset.label}</span>
                  <span className="mood-sheet-item-tagline">{preset.tagline}</span>
                  {isActive ? (
                    <span className="mood-sheet-item-badge">Active</span>
                  ) : isPending ? (
                    <span className="mood-sheet-item-badge">Applying…</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

interface MoodIndicatorProps {
  pageAccountId: string;
  mood: ResolvedMood;
}

export function MoodIndicator({ pageAccountId, mood }: MoodIndicatorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mood-indicator"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="mood-indicator-dot" aria-hidden="true" />
        <span>{mood.label}</span>
        {mood.note ? (
          <span className="mood-indicator-note">· {mood.note}</span>
        ) : null}
      </button>

      <MoodSheet
        open={open}
        pageAccountId={pageAccountId}
        activeMood={mood}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

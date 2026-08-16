'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import {
  ChartFillIcon,
  OsHugSheet,
  OsIconAction,
  SheetCloseButton,
  SheetFactRow,
  SheetFactSection,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ProfileReputation } from '@/lib/profile-signals';

function formatScore(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function ReputationFactsSheet({
  open,
  onOpenChange,
  accountId,
  reputation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  reputation: ProfileReputation | null;
}) {
  const [closing, setClosing] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Reputation"
        copy={
          reputation
            ? reputation.rank > 0
              ? `Rank #${reputation.rank} · protocol v1`
              : 'Protocol reputation v1'
            : 'Not indexed yet'
        }
        closeAriaLabel="Close reputation"
        backdropLabel="Close reputation"
        zIndex={56}
        {...(mood?.id ? { moodId: mood.id } : {})}
        {...(panelStyle ? { panelStyle } : {})}
        headerActions={
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            <OsIconAction
              ariaLabel="Open leaderboard"
              onClick={() => setLeaderboardOpen(true)}
            >
              <ChartFillIcon
                className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                aria-hidden
              />
            </OsIconAction>
            <SheetCloseButton
              onClick={requestClose}
              ariaLabel="Close reputation"
            />
          </div>
        }
      >
        {!reputation ? (
          <p className="portfolio-support-collect-info-empty">
            No protocol reputation indexed for @{accountId} yet. Standing,
            endorsements, posting, and consistency build this score.
          </p>
        ) : (
          <>
            <div className="reputation-facts-headline">
              <span className="reputation-facts-score">
                {formatScore(reputation.reputation)}
              </span>
              <span className="reputation-facts-score-label">Reputation</span>
            </div>
            <SheetFactSection title="Breakdown">
              <SheetFactRow
                label="Social"
                value={formatScore(reputation.socialScore)}
              />
              <SheetFactRow
                label="Commitment"
                value={formatScore(reputation.commitmentScore)}
              />
              <SheetFactRow
                label="Quality"
                value={formatScore(reputation.qualityScore)}
              />
              <SheetFactRow
                label="Consistency"
                value={formatScore(reputation.consistencyScore)}
              />
              <SheetFactRow
                label="Confidence"
                value={`${Math.round(reputation.confidenceScore * 100)}%`}
              />
              <SheetFactRow
                label="Posts"
                value={String(reputation.totalPosts)}
              />
            </SheetFactSection>
          </>
        )}
      </OsHugSheet>

      <LeaderboardSheet
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        initialTrack="reputation"
      />
    </>
  );
}

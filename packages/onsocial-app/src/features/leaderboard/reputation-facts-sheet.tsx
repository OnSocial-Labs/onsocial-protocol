'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import {
  OsHugSheet,
  SheetCloseButton,
} from '@onsocial/ui';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ProfileReputation } from '@/lib/profile-signals';

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
        panelClassName="guild-facts-sheet-panel"
        bodyClassName="guild-facts-sheet-body"
        {...(mood?.id ? { moodId: mood.id } : {})}
        {...(panelStyle ? { panelStyle } : {})}
        headerActions={
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            <LeaderboardChartAction
              onClick={() => setLeaderboardOpen(true)}
            />
            <SheetCloseButton
              onClick={requestClose}
              ariaLabel="Close reputation"
            />
          </div>
        }
      >
        <div className="guild-facts">
          <ReputationBreakdownFacts
            accountId={accountId}
            reputation={reputation}
          />
        </div>
      </OsHugSheet>

      <LeaderboardSheet
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        initialTrack="reputation"
      />
    </>
  );
}

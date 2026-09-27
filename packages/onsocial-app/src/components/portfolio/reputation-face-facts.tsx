'use client';

import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { ReputationFactsSheet } from '@/features/leaderboard/reputation-facts-sheet';
import type { ProfileReputation } from '@/lib/profile-signals';

/** Face score drawer. Loaded on first open so the profile does not pull the board. */
export function ReputationFaceFacts({
  open,
  onClose,
  accountId,
  reputation,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  reputation: ProfileReputation | null;
}) {
  return (
    <ReputationFactsSheet
      open={open}
      onClose={onClose}
      accountId={accountId}
      reputation={reputation}
      headerExtra={<LeaderboardChartAction track="reputation" />}
    />
  );
}

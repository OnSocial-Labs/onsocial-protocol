'use client';

import { useState } from 'react';
import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import type { ProfileReputation } from '@/lib/profile-signals';

interface ReputationPanelProps {
  accountId: string;
  reputation: ProfileReputation | null;
}

/**
 * Overlay deep-link panel — same facts chrome as the portfolio hug drawer.
 */
export function ReputationPanel({
  accountId,
  reputation,
}: ReputationPanelProps) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  return (
    <div className="panel-body reputation-panel-body">
      <div className="guild-facts reputation-panel-facts">
        <div className="reputation-panel-actions">
          <LeaderboardChartAction
            onClick={() => setLeaderboardOpen(true)}
          />
        </div>
        <ReputationBreakdownFacts
          accountId={accountId}
          reputation={reputation}
        />
      </div>
      <LeaderboardSheet
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        initialTrack="reputation"
      />
    </div>
  );
}

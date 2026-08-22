'use client';

import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import type { ProfileReputation } from '@/lib/profile-signals';

interface ReputationPanelProps {
  accountId: string;
  reputation: ProfileReputation | null;
}

/**
 * Portfolio glass overlay (`/@account/reputation`) — face signal deep-link.
 * Chart navigates to `/leaderboard?track=reputation`.
 */
export function ReputationPanel({
  accountId,
  reputation,
}: ReputationPanelProps) {
  return (
    <div className="panel-body reputation-panel-body">
      <div className="guild-facts reputation-panel-facts">
        <div className="reputation-panel-actions">
          <LeaderboardChartAction track="reputation" />
        </div>
        <ReputationBreakdownFacts
          accountId={accountId}
          reputation={reputation}
        />
      </div>
    </div>
  );
}

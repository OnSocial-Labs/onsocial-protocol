'use client';

import { osHugSheetBodyClassName } from '@onsocial/ui';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import type { ProfileReputation } from '@/lib/profile-signals';

interface ReputationPanelProps {
  accountId: string;
  reputation: ProfileReputation | null;
}

/**
 * Portfolio glass overlay (`/@account/reputation`) — face signal deep-link.
 * Leaderboard chart lives in overlay / full-page chrome, next to close.
 */
export function ReputationPanel({
  accountId,
  reputation,
}: ReputationPanelProps) {
  return (
    <div
      className={`panel-body reputation-panel-body ${osHugSheetBodyClassName}`}
    >
      <div className="guild-facts reputation-panel-facts">
        <ReputationBreakdownFacts
          accountId={accountId}
          reputation={reputation}
        />
      </div>
    </div>
  );
}

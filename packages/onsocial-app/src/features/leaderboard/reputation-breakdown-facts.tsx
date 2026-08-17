'use client';

import {
  SheetFactCopy,
  SheetFactCount,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import {
  formatReputationComponent,
  formatReputationScore,
  reputationConfidenceLabel,
} from '@/lib/leaderboard';
import type { ProfileReputation } from '@/lib/profile-signals';

export function ReputationBreakdownFacts({
  accountId,
  reputation,
}: {
  accountId: string;
  reputation: ProfileReputation | null;
}) {
  if (!reputation) {
    return (
      <p className="portfolio-support-collect-info-empty">
        No protocol reputation indexed for @{accountId} yet. Weighted
        stands, endorsements, posting, and consistency build this score.
      </p>
    );
  }

  const confidence = reputationConfidenceLabel(reputation.confidenceScore);

  return (
    <>
      <div className="reputation-facts-headline">
        <span className="reputation-facts-score">
          {formatReputationScore(reputation.reputation)}
        </span>
        <span className="reputation-facts-score-label">
          Reputation
          {reputation.rank > 0 ? ` · rank #${reputation.rank}` : ''}
        </span>
      </div>

      <SheetFactSection title="Breakdown">
        <SheetFactRow
          label="Social"
          value={formatReputationComponent(reputation.socialScore)}
        />
        <SheetFactRow
          label="Commitment"
          value={formatReputationComponent(reputation.commitmentScore)}
        />
        <SheetFactRow
          label="Quality"
          value={formatReputationComponent(reputation.qualityScore)}
        />
        <SheetFactRow
          label="Consistency"
          value={formatReputationComponent(reputation.consistencyScore)}
        />
        <SheetFactRow
          label="Scarces"
          value={formatReputationComponent(reputation.scarcesScore)}
        />
        <SheetFactRow
          label="Confidence"
          value={`${confidence.label} · ${Math.round(reputation.confidenceScore * 100)}%`}
        />
        <SheetFactRow
          label="Posts"
          value={
            <SheetFactCount
              count={reputation.totalPosts}
              unit={reputation.totalPosts === 1 ? 'post' : 'posts'}
            />
          }
        />
      </SheetFactSection>

      <SheetFactCopy>{confidence.detail}</SheetFactCopy>
    </>
  );
}

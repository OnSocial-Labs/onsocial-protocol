'use client';

import type { ReactNode } from 'react';
import {
  SheetFactCopy,
  SheetFactCount,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import {
  commitmentLabel,
  formatReputationComponent,
  formatReputationScore,
  reputationConfidenceLabel,
} from '@/lib/leaderboard';
import type { ProfileReputation } from '@/lib/profile-signals';

function FactorLabel({
  title,
  hint,
}: {
  title: string;
  hint: string;
}): ReactNode {
  return (
    <span className="reputation-facts-factor-label">
      <span className="reputation-facts-factor-title">{title}</span>
      <span className="reputation-facts-factor-hint">{hint}</span>
    </span>
  );
}

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
        No reputation indexed for @{accountId} yet. It grows from stands,
        endorsements, paid support, posts, and consistent activity.
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

      <SheetFactCopy className="reputation-facts-intro">
        Built from who stands with you, paid support, what you publish, and how
        consistently you show up.
      </SheetFactCopy>

      <SheetFactSection title="Score">
        <SheetFactRow
          label={
            <FactorLabel
              title="Social"
              hint="Stands, endorsements, paid support"
            />
          }
          value={formatReputationComponent(reputation.socialScore)}
        />
        <SheetFactRow
          label={
            <FactorLabel
              title="Commitment"
              hint="Protocol boost stake and lock time"
            />
          }
          value={formatReputationComponent(reputation.commitmentScore)}
        />
        <SheetFactRow
          label={
            <FactorLabel
              title="Quality"
              hint="Reactions, conversations, and amplifies"
            />
          }
          value={formatReputationComponent(reputation.qualityScore)}
        />
        <SheetFactRow
          label={
            <FactorLabel
              title="Consistency"
              hint="Steady activity over time"
            />
          }
          value={formatReputationComponent(reputation.consistencyScore)}
        />
        <SheetFactRow
          label={
            <FactorLabel
              title="Scarces"
              hint="Creates, sales, and fans"
            />
          }
          value={formatReputationComponent(reputation.scarcesScore)}
        />
        <SheetFactRow
          label={
            <FactorLabel
              title="Confidence"
              hint="How much signal backs this score"
            />
          }
          value={`${confidence.label} · ${Math.round(reputation.confidenceScore * 100)}%`}
        />
      </SheetFactSection>

      <SheetFactSection title="Activity">
        <SheetFactRow
          label="Posts"
          value={
            <SheetFactCount
              count={reputation.totalPosts}
              unit={reputation.totalPosts === 1 ? 'post' : 'posts'}
            />
          }
        />
        <SheetFactRow
          label="Paid supporters"
          value={
            <SheetFactCount
              count={reputation.paidSupportSpenders}
              unit={
                reputation.paidSupportSpenders === 1
                  ? 'supporter'
                  : 'supporters'
              }
            />
          }
        />
        <SheetFactRow
          label="Conversations"
          value={
            <SheetFactCount
              count={reputation.uniqueInboundPeers}
              unit={
                reputation.uniqueInboundPeers === 1 ? 'peer' : 'peers'
              }
            />
          }
        />
        <SheetFactRow
          label="Scarce fans"
          value={
            <SheetFactCount
              count={reputation.uniqueScarceFans}
              unit={reputation.uniqueScarceFans === 1 ? 'fan' : 'fans'}
            />
          }
        />
        <SheetFactRow
          label="Amplifies received"
          value={
            <SheetFactCount
              count={reputation.amplifyEvents}
              unit={
                reputation.amplifyEvents === 1 ? 'amplify' : 'amplifies'
              }
            />
          }
        />
        <SheetFactRow
          label="Lock"
          value={commitmentLabel(reputation.lockMonths)}
        />
      </SheetFactSection>

      <SheetFactCopy>{confidence.detail}</SheetFactCopy>
    </>
  );
}

'use client';

import type { ReactNode } from 'react';
import { SheetFactRow, SheetFactSection } from '@onsocial/ui';
import {
  commitmentLabel,
  formatReputationComponent,
  formatReputationScore,
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
        No reputation indexed for @{accountId} yet.
      </p>
    );
  }

  const rankLabel =
    reputation.rank > 0 ? `#${reputation.rank}` : null;
  const lock = commitmentLabel(reputation.lockMonths);

  const factors: { title: string; hint: string; value: string }[] = [
    {
      title: 'Social',
      hint: 'Stands, endorsements, paid support',
      value: formatReputationComponent(reputation.socialScore),
    },
    {
      title: 'Commitment',
      hint: `Boost lock · ${lock}`,
      value: formatReputationComponent(reputation.commitmentScore),
    },
    {
      title: 'Quality',
      hint: 'Reactions, conversations, amplifies',
      value: formatReputationComponent(reputation.qualityScore),
    },
    {
      title: 'Consistency',
      hint: 'Steady activity',
      value: formatReputationComponent(reputation.consistencyScore),
    },
    {
      title: 'Scarces',
      hint: 'Creates, sales, fans',
      value: formatReputationComponent(reputation.scarcesScore),
    },
  ];

  const activity: { label: string; value: number }[] = [
    { label: 'Posts', value: reputation.totalPosts },
    { label: 'Supporters', value: reputation.paidSupportSpenders },
    { label: 'Peers', value: reputation.uniqueInboundPeers },
    { label: 'Fans', value: reputation.uniqueScarceFans },
    { label: 'Amplifies', value: reputation.amplifyEvents },
  ];

  return (
    <>
      <div className="reputation-facts-headline">
        <span className="reputation-facts-score">
          {formatReputationScore(reputation.reputation)}
        </span>
        {rankLabel ? (
          <span className="reputation-facts-score-label">{rankLabel}</span>
        ) : null}
      </div>

      <SheetFactSection title="Factors">
        {factors.map((factor) => (
          <SheetFactRow
            key={factor.title}
            label={
              <FactorLabel title={factor.title} hint={factor.hint} />
            }
            value={factor.value}
          />
        ))}
      </SheetFactSection>

      <SheetFactSection
        title="Activity"
        className="reputation-facts-activity"
      >
        {activity.map((row) => (
          <SheetFactRow
            key={row.label}
            label={row.label}
            value={String(row.value)}
          />
        ))}
      </SheetFactSection>
    </>
  );
}

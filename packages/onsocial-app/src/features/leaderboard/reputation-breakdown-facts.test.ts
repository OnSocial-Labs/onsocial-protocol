import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import type { ProfileReputation } from '@/lib/profile-signals';

const sample: ProfileReputation = {
  reputation: 42.5,
  rank: 12,
  socialScore: 10,
  commitmentScore: 8,
  qualityScore: 7,
  consistencyScore: 6,
  scarcesScore: 5,
  confidenceScore: 0.8,
  lockMonths: 3,
  totalPosts: 4,
  paidSupportSpenders: 2,
  uniqueInboundPeers: 9,
  uniqueScarceFans: 1,
  amplifyEvents: 3,
};

describe('ReputationBreakdownFacts', () => {
  it('renders overlay-friendly intro and factor hints', () => {
    const html = renderToStaticMarkup(
      createElement(ReputationBreakdownFacts, {
        accountId: 'alice.near',
        reputation: sample,
      })
    );
    expect(html).toContain('Built from who stands with you');
    expect(html).toContain('Stands, endorsements, paid support');
    expect(html).toContain('Protocol boost stake and lock time');
    expect(html).toContain('Reactions, conversations, and amplifies');
    expect(html).toContain('Creates, sales, and fans');
    expect(html).toContain('Score');
    expect(html).toContain('Activity');
    expect(html).toContain('Lock');
    expect(html).toContain('rank #12');
  });

  it('explains empty state in plain language', () => {
    const html = renderToStaticMarkup(
      createElement(ReputationBreakdownFacts, {
        accountId: 'bob.near',
        reputation: null,
      })
    );
    expect(html).toContain('No reputation indexed for @bob.near yet');
    expect(html).toContain('stands');
  });
});

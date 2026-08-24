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
  it('keeps the headline compact and factors honest', () => {
    const html = renderToStaticMarkup(
      createElement(ReputationBreakdownFacts, {
        accountId: 'alice.near',
        reputation: sample,
      })
    );
    expect(html).toContain('42.5');
    expect(html).toContain('#12');
    expect(html).not.toContain('Established');
    expect(html).not.toContain('80%');
    expect(html).not.toContain('Limited data');
    expect(html).toContain('Stands, endorsements, paid support');
    expect(html).toContain('Boost lock · Scout');
    expect(html).toContain('Reactions, conversations, amplifies');
    expect(html).toContain('Creates, sales, fans');
    expect(html).toContain('Factors');
    expect(html).toContain('Activity');
    expect(html).toContain('Supporters');
    expect(html).toContain('Peers');
    expect(html).not.toContain('Reputation · rank');
    expect(html).not.toContain('How much signal backs this score');
    expect(html).not.toContain('Backed by a broad set of indexed protocol signals');
  });

  it('explains empty state in plain language', () => {
    const html = renderToStaticMarkup(
      createElement(ReputationBreakdownFacts, {
        accountId: 'bob.near',
        reputation: null,
      })
    );
    expect(html).toContain('No reputation indexed for @bob.near yet');
  });

  it('omits rank label when unranked', () => {
    const html = renderToStaticMarkup(
      createElement(ReputationBreakdownFacts, {
        accountId: 'cara.near',
        reputation: { ...sample, confidenceScore: 0.4, rank: 0 },
      })
    );
    expect(html).not.toContain('Building');
    expect(html).not.toContain('40%');
    expect(html).not.toContain('Limited data');
    expect(html).not.toContain('#0');
  });
});

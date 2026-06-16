import { describe, expect, it } from 'vitest';

import { seasonSettlementPoolSummary } from '@/features/season/season-zero-settlement-copy';
import type { SeasonZeroSettlementSummary } from '@/features/season/season-zero-types';

function settlement(
  overrides: Partial<SeasonZeroSettlementSummary> = {}
): SeasonZeroSettlementSummary {
  return {
    seasonId: 'season-one',
    status: 'published',
    root: 'abc',
    totalAmountYocto: '1245000000000000000000',
    indexedPoolAmountYocto: '1245000000000000000000',
    participantCount: 200,
    rewardCount: 156,
    active: true,
    publishedTxHash: 'hash',
    publishedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('season-zero-settlement-copy', () => {
  it('formats winner count and allocated pool for the collect row', () => {
    expect(seasonSettlementPoolSummary(settlement())).toBe(
      '156 winners · 1,245 SOCIAL allocated'
    );
  });

  it('uses singular winner label for one reward', () => {
    expect(seasonSettlementPoolSummary(settlement({ rewardCount: 1 }))).toBe(
      '1 winner · 1,245 SOCIAL allocated'
    );
  });
});

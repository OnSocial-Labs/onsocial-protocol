import { describe, expect, it } from 'vitest';
import { deriveGuildAccessGated } from '@/features/guilds/guild-config';
import {
  applyChainGuildFacts,
  readGroupStatsCreatedAt,
  readGroupStatsMemberCount,
  resolveGuildMemberCount,
} from '@/features/guilds/guild-facts';
import { guildSummaryCardFromBrowse } from '@/features/guilds/guild-facts';

describe('guild-facts', () => {
  it('reads total_members from chain stats', () => {
    expect(readGroupStatsMemberCount({ total_members: 4 })).toBe(4);
    expect(readGroupStatsMemberCount({ member_count: 2 })).toBe(2);
    expect(readGroupStatsMemberCount(null)).toBeNull();
  });

  it('reads created_at from chain stats', () => {
    expect(readGroupStatsCreatedAt({ created_at: '1727740800000000000' })).toBe(
      1727740800000000000
    );
    expect(readGroupStatsCreatedAt({ created_at: 100 })).toBe(100);
    expect(readGroupStatsCreatedAt(null)).toBeNull();
  });

  it('derives access the same way for config and indexer', () => {
    expect(deriveGuildAccessGated({ is_private: true })).toBe(true);
    expect(deriveGuildAccessGated({ isPublic: false })).toBe(true);
    expect(deriveGuildAccessGated({ isPublic: true })).toBe(false);
    expect(deriveGuildAccessGated({ isPublic: null })).toBe(false);
  });

  it('prefers chain member count and never undercuts roster floor', () => {
    expect(
      resolveGuildMemberCount({
        chainStats: { total_members: 5 },
        indexedCount: 3,
        rosterFloor: 4,
      })
    ).toBe(5);

    expect(
      resolveGuildMemberCount({
        chainStats: null,
        indexedCount: 2,
        rosterFloor: 4,
      })
    ).toBe(4);
  });

  it('applies chain config + stats to summary cards', () => {
    const card = guildSummaryCardFromBrowse({
      groupId: 'dao',
      groupName: 'DAO',
      isPublic: true,
      isMemberDriven: false,
    });

    const enriched = applyChainGuildFacts(card, {
      config: {
        is_private: true,
        tags: ['builders', 'social', 'extra'],
      },
      stats: { total_members: 9 },
      indexedMemberCount: 7,
    });

    expect(enriched.accessGated).toBe(true);
    expect(enriched.memberCount).toBe(9);
    expect(enriched.tags).toEqual(['builders', 'social']);
  });
});

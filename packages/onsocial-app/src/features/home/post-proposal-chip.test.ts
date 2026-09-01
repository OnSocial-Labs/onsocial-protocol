import { describe, expect, it } from 'vitest';
import { postProposalHref } from '@/features/home/post-proposal-chip';

describe('postProposalHref', () => {
  it('builds a guild proposals deep link from the embed', () => {
    expect(
      postProposalHref(
        { kind: 'proposal', groupId: 'builders.near', proposalId: '12' },
        null
      )
    ).toBe('/groups/builders.near?sheet=proposals&proposal=12');
  });

  it('falls back to the paint snapshot when the embed is missing ids', () => {
    expect(
      postProposalHref(null, {
        groupId: 'builders.near',
        proposalId: '12',
        title: 'Invite alice.near',
      })
    ).toBe('/groups/builders.near?sheet=proposals&proposal=12');
  });

  it('returns null without both ids', () => {
    expect(
      postProposalHref({ kind: 'proposal', groupId: 'builders.near', proposalId: '' }, null)
    ).toBeNull();
  });
});

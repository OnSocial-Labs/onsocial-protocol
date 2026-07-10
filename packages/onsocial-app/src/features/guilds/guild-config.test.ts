import { describe, expect, it } from 'vitest';
import {
  canVoteOnGuildMemberRequest,
  isOwnGuildMemberRequest,
  isOwnJoinRequestProposal,
  memberRequestRowToProposal,
  normalizeGuildTagList,
  normalizeGuildTagsInput,
  GUILD_MAX_TAGS,
} from '@/features/guilds/guild-config';

const row = {
  id: 'p1',
  requesterId: 'test05.onsocial',
  message: 'Join request submitted for community approval',
  requestedAt: null,
  proposalId: 'p1',
};

describe('guild member request access', () => {
  it('treats matching requester ids as own requests', () => {
    expect(isOwnGuildMemberRequest(row, 'test05.onsocial')).toBe(true);
    expect(isOwnGuildMemberRequest(row, 'TEST05.ONSOCIAL')).toBe(true);
    expect(isOwnGuildMemberRequest(row, 'alice.near')).toBe(false);
  });

  it('blocks non-members and requesters from voting', () => {
    expect(
      canVoteOnGuildMemberRequest({
        row,
        accountId: 'test05.onsocial',
        isMember: false,
      })
    ).toBe(false);

    expect(
      canVoteOnGuildMemberRequest({
        row,
        accountId: 'test05.onsocial',
        isMember: true,
      })
    ).toBe(false);

    expect(
      canVoteOnGuildMemberRequest({
        row,
        accountId: 'alice.near',
        isMember: true,
      })
    ).toBe(true);
  });

  it('maps legacy join requests into proposal cards', () => {
    const proposal = memberRequestRowToProposal(row);
    expect(proposal.type).toBe('join_request');
    expect(isOwnJoinRequestProposal(proposal, 'test05.onsocial')).toBe(true);
  });
});

describe('guild tags', () => {
  it(`keeps at most ${GUILD_MAX_TAGS} tags with the first as primary`, () => {
    expect(
      normalizeGuildTagsInput('Builders, Social, Extra, Noise')
    ).toEqual(['builders', 'social']);
    expect(
      normalizeGuildTagList(['Near', 'near', 'grants', 'dao'])
    ).toEqual(['near', 'grants']);
  });
});

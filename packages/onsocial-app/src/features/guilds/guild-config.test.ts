import { describe, expect, it } from 'vitest';
import {
  canVoteOnGuildMemberRequest,
  isOwnGuildMemberRequest,
  isOwnJoinRequestProposal,
  memberRequestRowToProposal,
  mergeGuildOnsocialMetadataPatch,
  normalizeGuildConfig,
  normalizeGuildTagList,
  normalizeGuildTagsInput,
  GUILD_MAX_TOPICS,
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

describe('guild topics', () => {
  it(`keeps at most ${GUILD_MAX_TOPICS} topics with the first as primary`, () => {
    expect(
      normalizeGuildTagsInput('Builders, Social, Extra, Noise')
    ).toEqual(['builders', 'social']);
    expect(
      normalizeGuildTagList(['Near', 'near', 'grants', 'dao'])
    ).toEqual(['near', 'grants']);
  });

  it('reads topics[] from group config', () => {
    expect(
      normalizeGuildConfig('dao', {
        name: 'DAO',
        is_private: false,
        topics: ['builders', 'social'],
      }).topics
    ).toEqual(['builders', 'social']);
  });
});

describe('guild onsocial metadata merge', () => {
  it('keeps banner when structure is patched', () => {
    const existing = {
      x: {
        onsocial: {
          banner: { cid: 'bafyBanner', mime: 'image/png', size: 12 },
        },
      },
    };
    const patch = mergeGuildOnsocialMetadataPatch(existing, {
      structure: { v: 1, defaultSpaceId: 'general', spaces: [] },
    });
    expect(patch.x.onsocial.banner).toEqual({
      cid: 'bafyBanner',
      mime: 'image/png',
      size: 12,
    });
    expect(patch.x.onsocial.structure).toEqual({
      v: 1,
      defaultSpaceId: 'general',
      spaces: [],
    });
  });

  it('keeps structure when banner is patched', () => {
    const existing = {
      x: {
        onsocial: {
          structure: { v: 1, defaultSpaceId: 'club', spaces: [] },
        },
      },
    };
    const patch = mergeGuildOnsocialMetadataPatch(existing, {
      banner: { cid: 'bafyNew', mime: 'image/jpeg', size: 9 },
    });
    expect(patch.x.onsocial.structure).toEqual({
      v: 1,
      defaultSpaceId: 'club',
      spaces: [],
    });
    expect(patch.x.onsocial.banner).toEqual({
      cid: 'bafyNew',
      mime: 'image/jpeg',
      size: 9,
    });
  });
});

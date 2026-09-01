import { describe, expect, it } from 'vitest';
import {
  isProposalComposeDraftReady,
  proposalEmbedFromDraft,
  proposalSnapshotExtra,
  resolvedProposalPostText,
} from '@/features/guilds/proposal-post-payload';

const draft = {
  groupId: 'builders.near',
  proposalId: '12',
  title: 'Invite alice.near',
  kind: 'Role',
  status: 'active',
  groupName: 'Builders',
};

describe('proposal-post-payload', () => {
  it('requires groupId and proposalId', () => {
    expect(isProposalComposeDraftReady(null)).toBe(false);
    expect(
      isProposalComposeDraftReady({
        groupId: '',
        proposalId: '12',
        title: 'x',
      })
    ).toBe(false);
    expect(isProposalComposeDraftReady(draft)).toBe(true);
  });

  it('builds a durable proposal embed', () => {
    expect(proposalEmbedFromDraft(draft)).toEqual({
      kind: 'proposal',
      groupId: 'builders.near',
      proposalId: '12',
    });
  });

  it('nests paint snapshot under x.onsocial.proposal', () => {
    expect(proposalSnapshotExtra(draft)).toEqual({
      onsocial: {
        proposal: {
          groupId: 'builders.near',
          proposalId: '12',
          title: 'Invite alice.near',
          kind: 'Role',
          status: 'active',
          groupName: 'Builders',
        },
      },
    });
  });

  it('falls back to the proposal title when the caption is empty', () => {
    expect(resolvedProposalPostText('', draft)).toBe('Invite alice.near');
    expect(resolvedProposalPostText('  vote  ', draft)).toBe('vote');
  });
});

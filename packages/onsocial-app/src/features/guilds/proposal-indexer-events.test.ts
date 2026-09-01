import { describe, expect, it } from 'vitest';
import {
  latestProposalPaintFromEvents,
  mergeProposalPaint,
  openPickerDraftsFromEvents,
  proposalChipKindLine,
  type ProposalIndexerEvent,
} from '@/features/guilds/proposal-indexer-events';

const created: ProposalIndexerEvent = {
  operation: 'proposal_created',
  groupId: 'builders.near',
  proposalId: '12',
  title: 'Invite alice.near',
  proposalType: 'member_invite',
  status: 'active',
};

const executed: ProposalIndexerEvent = {
  operation: 'proposal_status_updated',
  groupId: 'builders.near',
  proposalId: '12',
  status: 'executed',
};

describe('openPickerDraftsFromEvents', () => {
  it('keeps active governance proposals and drops join requests', () => {
    const drafts = openPickerDraftsFromEvents(
      [
        created,
        {
          operation: 'proposal_created',
          groupId: 'builders.near',
          proposalId: '3',
          title: 'Let bob in',
          proposalType: 'join_request',
          status: 'active',
        },
      ],
      new Map([['builders.near', 'Builders']])
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        pickerKey: 'builders.near:12',
        title: 'Invite alice.near',
        kind: 'Invite',
        status: 'active',
        groupName: 'Builders',
      }),
    ]);
  });

  it('drops proposals after a later status update', () => {
    const drafts = openPickerDraftsFromEvents(
      [executed, created],
      new Map()
    );
    expect(drafts).toEqual([]);
  });
});

describe('latestProposalPaintFromEvents', () => {
  it('uses the newest status and created title', () => {
    expect(
      latestProposalPaintFromEvents([executed, created], {
        groupId: 'builders.near',
        proposalId: '12',
      })
    ).toEqual({
      groupId: 'builders.near',
      proposalId: '12',
      title: 'Invite alice.near',
      kind: 'Invite',
      status: 'executed',
    });
  });
});

describe('mergeProposalPaint', () => {
  it('lets live status win and keeps the snapshot guild name', () => {
    expect(
      mergeProposalPaint(
        {
          groupId: 'builders.near',
          proposalId: '12',
          title: 'Invite alice.near',
          kind: 'Invite',
          status: 'active',
          groupName: 'Builders',
        },
        { status: 'executed', title: 'Invite alice.near' }
      )
    ).toMatchObject({
      status: 'executed',
      groupName: 'Builders',
      title: 'Invite alice.near',
    });
  });
});

describe('proposalChipKindLine', () => {
  it('appends the live status label', () => {
    expect(proposalChipKindLine('Invite', 'active')).toBe('Invite · Open');
    expect(proposalChipKindLine('Invite', 'executed')).toBe(
      'Invite · Approved'
    );
    expect(proposalChipKindLine('Invite', null)).toBe('Invite');
  });
});

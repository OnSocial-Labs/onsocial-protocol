import { describe, expect, it } from 'vitest';
import {
  guildProposalClosesLabel,
  guildProposalPresentation,
  guildProposalTallyLabel,
  guildProposalTitle,
  guildProposalOutcome,
  guildProposalVoteProgress,
  guildViewerVoteLabel,
  parseVotingPeriodNs,
  partitionGuildGovernanceProposals,
} from '@/features/guilds/guild-proposal-display';

const baseProposal = {
  id: 'p1',
  sequence_number: 1,
  title: 'Role change',
  type: 'permission_change',
  description: '',
  proposer: 'alice.near',
  data: {},
  created_at: '1',
  status: 'active' as const,
  voting_config: {
    participation_quorum_bps: 5100,
    majority_threshold_bps: 5001,
    voting_period: '604800000000000',
  },
};

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
const now = new Date('2026-07-08T12:00:00.000Z');
const voteStartNs = BigInt(now.getTime() - 5 * 60 * 1000) * 1_000_000n;

describe('guild-proposal-display', () => {
  it('formats permission change proposals from chain title copy', () => {
    const presentation = guildProposalPresentation({
      ...baseProposal,
      title: 'Change Permission for greenghost.onsocial.testnet to level 2',
      type: 'permission_change',
      target: 'greenghost.onsocial.testnet',
      data: {},
    });

    expect(presentation.headline).toBe(
      'Make greenghost.onsocial.testnet a Moderator'
    );
    expect(presentation.kind).toBe('Role');
    expect(presentation.roleLabel).toBe('Moderator');
    expect(presentation.targetAccountId).toBe('greenghost.onsocial.testnet');
    expect(presentation.suppressDescription).toBe(true);
  });

  it('formats path permission grants as room access', () => {
    const presentation = guildProposalPresentation({
      ...baseProposal,
      title:
        'Grant Path Permission on groups/dao/spaces/shipping-room/write to greenghost.onsocial.testnet',
      type: 'path_permission_grant',
      target: 'greenghost.onsocial.testnet',
      description: 'Allow sharing in Shipping Room',
      data: {
        path: 'groups/dao/spaces/shipping-room/write',
        target_user: 'greenghost.onsocial.testnet',
        reason: 'Allow sharing in Shipping Room',
      },
    });

    expect(presentation.kind).toBe('Room');
    expect(presentation.kindTone).toBe('access');
    expect(presentation.headline).toBe('Allow sharing in Shipping Room');
    expect(presentation.targetAccountId).toBe('greenghost.onsocial.testnet');
  });

  it('formats metadata updates without chain jargon', () => {
    const presentation = guildProposalPresentation({
      ...baseProposal,
      title: 'Update Group: Metadata',
      type: 'group_update_metadata',
      target: 'alice.near',
      description: 'Guild rooms update',
      data: {},
    });

    expect(presentation.kind).toBe('Update');
    expect(presentation.headline).toBe('Guild rooms update');
    expect(presentation.targetAccountId).toBeNull();
  });

  it('formats ban and unban proposals', () => {
    const ban = guildProposalPresentation({
      ...baseProposal,
      title: 'Update Group: Ban',
      type: 'group_update_ban',
      target: 'mallory.near',
      description: '',
      data: {
        GroupUpdate: {
          update_type: 'ban',
          target_user: 'mallory.near',
          reason: 'Harassment',
        },
      },
    });
    expect(ban.kind).toBe('Ban');
    expect(ban.kindTone).toBe('access');
    expect(ban.headline).toBe('Ban mallory.near');
    expect(ban.targetAccountId).toBe('mallory.near');
    expect(ban.detail).toBe('Harassment');

    const unban = guildProposalPresentation({
      ...baseProposal,
      title: 'Update Group: Unban',
      type: 'group_update_unban',
      target: 'mallory.near',
      description: '',
      data: {
        GroupUpdate: {
          update_type: 'unban',
          target_user: 'mallory.near',
        },
      },
    });
    expect(unban.kind).toBe('Unban');
    expect(unban.headline).toBe('Unban mallory.near');
    expect(unban.targetAccountId).toBe('mallory.near');
  });

  it('formats proposal titles by type when chain copy is missing', () => {
    expect(
      guildProposalTitle({
        ...baseProposal,
        title: '',
        type: 'permission_change',
      })
    ).toBe('Role change');
  });

  it('formats tally and viewer vote labels', () => {
    expect(
      guildProposalTallyLabel({
        yes_votes: 2,
        total_votes: 3,
        created_at: '1',
        locked_member_count: 5,
      })
    ).toBe('2 supported · 3 voted');
    expect(guildViewerVoteLabel(true)).toBe('You supported');
  });

  it('derives vote progress from quorum rules', () => {
    const progress = guildProposalVoteProgress(
      baseProposal,
      {
        yes_votes: 1,
        total_votes: 1,
        created_at: voteStartNs.toString(),
        locked_member_count: 2,
      },
      now
    );

    expect(progress.quorumVotesRequired).toBe(2);
    expect(progress.label).toBe('1/2 · need 1 more');
    expect(progress.supportPoolPercent).toBe(50);
  });

  it('labels deciding votes and voting deadlines', () => {
    const tally = {
      yes_votes: 1,
      total_votes: 2,
      created_at: voteStartNs.toString(),
      locked_member_count: 3,
    };

    const tiedProgress = guildProposalVoteProgress(baseProposal, tally, now);
    expect(tiedProgress.label).toBe('1–1 · 1 decides');
    expect(tiedProgress.closesLabel).toBe('Closes in 6d');

    const closes = guildProposalClosesLabel(baseProposal, tally, now);
    expect(closes.label).toBe('Closes in 6d');
    expect(parseVotingPeriodNs('7d')).toBe(604800000000000n);
    expect(parseVotingPeriodNs('604800000000000')).toBe(604800000000000n);

    const expiredProgress = guildProposalVoteProgress(
      baseProposal,
      tally,
      new Date(now.getTime() + sevenDaysMs + 60_000)
    );
    expect(expiredProgress.closesLabel).toBe('Voting closed');
    expect(expiredProgress.label).toContain('voting period ended');
  });

  it('labels approved and rejected outcomes', () => {
    const presentation = guildProposalPresentation({
      ...baseProposal,
      title: 'Change Permission for greenghost.onsocial.testnet to level 2',
      type: 'permission_change',
      target: 'greenghost.onsocial.testnet',
      status: 'executed',
    });

    expect(guildProposalOutcome(
      {
        ...baseProposal,
        type: 'permission_change',
        target: 'greenghost.onsocial.testnet',
        status: 'executed',
      },
      presentation
    )).toEqual({
      tone: 'approved',
      stripLabel: 'Approved',
      footerLabel: 'Moderator role applied',
      isTerminal: true,
    });

    const progress = guildProposalVoteProgress(
      {
        ...baseProposal,
        status: 'executed',
        voting_config: {
          participation_quorum_bps: 5100,
          majority_threshold_bps: 5001,
          voting_period: '1d',
        },
      },
      {
        yes_votes: 2,
        total_votes: 2,
        created_at: '1',
        locked_member_count: 2,
      }
    );
    expect(progress.label).toBe('2/2 supported · approved');
  });

  it('partitions active and resolved governance proposals', () => {
    const rows = [
      { ...baseProposal, id: 'a', status: 'active' as const, type: 'permission_change' },
      { ...baseProposal, id: 'b', status: 'executed' as const, type: 'permission_change' },
      { ...baseProposal, id: 'j', status: 'active' as const, type: 'join_request' },
    ];

    expect(partitionGuildGovernanceProposals(rows)).toEqual({
      active: [rows[0]],
      resolved: [rows[1]],
    });
  });
});

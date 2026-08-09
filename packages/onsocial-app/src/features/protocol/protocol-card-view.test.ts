import { describe, expect, it } from 'vitest';
import {
  resolveProtocolDaoAccountId,
  resolveProtocolDaoBoard,
} from '@/features/protocol/dao-accounts';
import {
  applyOptimisticVote,
  deriveProtocolProposalActions,
  proposalHeadline,
  statusLabel,
  sumVoteCounts,
} from '@/features/protocol/protocol-card-view';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
} from '@/features/protocol/types';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { parseProtocolDaoBoard, protocolPath } from '@/lib/app-routes';

describe('protocol dao boards', () => {
  it('resolves governance and treasury accounts', () => {
    expect(resolveProtocolDaoAccountId('governance')).toBe(
      GOVERNANCE_DAO_ACCOUNT
    );
    expect(resolveProtocolDaoAccountId('treasury')).toBe(TREASURY_DAO_ACCOUNT);
    expect(resolveProtocolDaoBoard(TREASURY_DAO_ACCOUNT)).toBe('treasury');
    expect(parseProtocolDaoBoard('treasury')).toBe('treasury');
    expect(protocolPath({ board: 'treasury' })).toBe('/protocol?dao=treasury');
    expect(protocolPath()).toBe('/protocol');
  });
});

describe('protocol card view', () => {
  const proposal: ProtocolDaoProposal = {
    id: 12,
    proposer: 'alice.testnet',
    description: 'Upgrade boost contract',
    kind: { FunctionCall: { receiver_id: 'boost.onsocial.testnet' } },
    status: 'InProgress',
    vote_counts: { council: ['1', '0', '0'] },
    votes: { 'bob.testnet': 'Approve' },
    submission_time: '1',
  };

  const policy: ProtocolDaoPolicy = {
    roles: [
      {
        name: 'council',
        kind: { Group: ['alice.testnet', 'bob.testnet'] },
        permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
      },
    ],
  };

  it('sums votes and labels status', () => {
    expect(sumVoteCounts(proposal.vote_counts, 0)).toBe(1);
    expect(statusLabel('InProgress')).toBe('In review');
  });

  it('builds headlines from protocol subject', () => {
    const application: ProtocolApplication = {
      app_id: 'protocol-proposal-12',
      label: 'Boost',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_subject: 'Boost contract',
      governance_proposal: {
        proposal_id: 12,
        status: 'InProgress',
        description: 'Upgrade boost contract',
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: '1',
        snapshot: proposal,
      },
    };
    expect(proposalHeadline(application)).toBe('Boost contract');
  });

  it('derives vote permissions for council members', () => {
    const view = deriveProtocolProposalActions({
      accountId: 'alice.testnet',
      daoPolicy: policy,
      proposal,
    });
    expect(view.canApprove).toBe(true);
    expect(view.canReject).toBe(true);
    expect(view.currentVote).toBeNull();

    const voted = deriveProtocolProposalActions({
      accountId: 'bob.testnet',
      daoPolicy: policy,
      proposal,
    });
    expect(voted.canApprove).toBe(false);
    expect(voted.currentVote).toBe('Approve');
  });

  it('applies optimistic votes', () => {
    const next = applyOptimisticVote(proposal, 'alice.testnet', 'Approve');
    expect(next.votes['alice.testnet']).toBe('Approve');
    expect(sumVoteCounts(next.vote_counts, 0)).toBe(2);
  });
});

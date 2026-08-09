import { describe, expect, it } from 'vitest';
import {
  resolveProtocolDaoAccountId,
  resolveProtocolDaoBoard,
} from '@/features/protocol/dao-accounts';
import {
  applyOptimisticVote,
  deriveProtocolProposalView,
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
    description: 'Upgrade boost contract to cleaned artifact',
    kind: { FunctionCall: { receiver_id: 'boost.onsocial.testnet' } },
    status: 'InProgress',
    vote_counts: { council: ['1', '0', '0'] },
    votes: { 'bob.testnet': 'Approve' },
    submission_time: String(BigInt(Date.now()) * 1_000_000n),
  };

  const policy: ProtocolDaoPolicy = {
    proposal_period: String(7n * 24n * 60n * 60n * 1_000_000_000n),
    default_vote_policy: {
      quorum: '0',
      threshold: [1, 2],
      weight_kind: 'RoleWeight',
    },
    roles: [
      {
        name: 'council',
        kind: { Group: ['alice.testnet', 'bob.testnet'] },
        permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
      },
    ],
  };

  const application: ProtocolApplication = {
    app_id: 'protocol-proposal-12',
    label: 'Boost',
    status: 'approved',
    description: null,
    created_at: '1',
    protocol_kind: 'upgrade',
    protocol_subject: 'Boost contract',
    protocol_target_account: 'boost.onsocial.testnet',
    protocol_target_method: 'update_contract_from_hash',
    governance_proposal: {
      proposal_id: 12,
      status: 'InProgress',
      description: proposal.description,
      dao_account: GOVERNANCE_DAO_ACCOUNT,
      tx_hash: null,
      submitted_at: proposal.submission_time,
      snapshot: proposal,
    },
  };

  it('sums votes and labels status', () => {
    expect(sumVoteCounts(proposal.vote_counts, 0)).toBe(1);
    expect(statusLabel('InProgress')).toBe('In review');
  });

  it('derives full on-page card view', () => {
    const view = deriveProtocolProposalView({
      application,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.headline).toBe('Boost contract');
    expect(view.actionBadge).toBe('Call');
    expect(view.description).toContain('Upgrade boost');
    expect(view.targetAccount).toBe('boost.onsocial.testnet');
    expect(view.canApprove).toBe(true);
    expect(view.canReject).toBe(true);
    expect(view.votingProgress.threshold).toBe(1);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.submission).not.toBeNull();
    expect(view.deadline).not.toBeNull();
  });

  it('blocks a second vote for the same guardian', () => {
    const view = deriveProtocolProposalView({
      application,
      accountId: 'bob.testnet',
      daoPolicy: policy,
    });
    expect(view.canApprove).toBe(false);
    expect(view.currentVote).toBe('Approve');
  });

  it('applies optimistic votes', () => {
    const next = applyOptimisticVote(proposal, 'alice.testnet', 'Approve');
    expect(next.votes['alice.testnet']).toBe('Approve');
    expect(sumVoteCounts(next.vote_counts, 0)).toBe(2);
  });

  it('enables finalize after the review window closes', () => {
    const expiredProposal: ProtocolDaoProposal = {
      ...proposal,
      status: 'Expired',
    };
    const expiredApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        status: 'Expired',
        snapshot: expiredProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: expiredApp,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.canFinalize).toBe(true);
    expect(view.finalizeLabel).toBe('Finalize');
    expect(view.canApprove).toBe(false);
  });
});

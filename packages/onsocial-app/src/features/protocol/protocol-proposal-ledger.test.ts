import { afterEach, describe, expect, it } from 'vitest';
import { applyOptimisticVote } from '@/features/protocol/protocol-card-view';
import {
  clearConfirmedProtocolProposalLedger,
  overlayConfirmedProtocolApplication,
  overlayConfirmedProtocolProposal,
  recordConfirmedProtocolProposal,
} from '@/features/protocol/protocol-proposal-ledger';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
} from '@/features/protocol/types';

const soloCouncil: ProtocolDaoPolicy = {
  proposal_period: String(7n * 24n * 60n * 60n * 1_000_000_000n),
  default_vote_policy: {
    quorum: '0',
    threshold: [1, 2],
    weight_kind: 'RoleWeight',
  },
  roles: [
    {
      name: 'council',
      kind: { Group: ['alice.testnet'] },
      permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
    },
  ],
};

function openProposal(): ProtocolDaoProposal {
  return {
    id: 7,
    proposer: 'alice.testnet',
    description: 'Signal',
    kind: { Vote: {} },
    status: 'InProgress',
    vote_counts: { council: ['0', '0', '0'] },
    votes: {},
    submission_time: '1',
  };
}

afterEach(() => {
  clearConfirmedProtocolProposalLedger();
});

describe('protocol proposal ledger', () => {
  it('holds a concluded reject until live get_proposal agrees', () => {
    const locked = applyOptimisticVote(
      openProposal(),
      'alice.testnet',
      'Reject',
      soloCouncil
    );
    recordConfirmedProtocolProposal('dao.testnet', locked);

    const stale = overlayConfirmedProtocolProposal(
      'dao.testnet',
      openProposal()
    );
    expect(stale.status).toBe('Rejected');
    expect(stale.votes['alice.testnet']).toBe('Reject');

    const live = overlayConfirmedProtocolProposal('dao.testnet', {
      ...locked,
      status: 'Rejected',
    });
    expect(live.status).toBe('Rejected');

    const after = overlayConfirmedProtocolProposal(
      'dao.testnet',
      openProposal()
    );
    expect(after.status).toBe('InProgress');
    expect(after.votes).toEqual({});
  });

  it('does not rewind an in-review approve while the second vote is still needed', () => {
    const twoCouncil: ProtocolDaoPolicy = {
      ...soloCouncil,
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet', 'bob.testnet'] },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const locked = applyOptimisticVote(
      openProposal(),
      'alice.testnet',
      'Approve',
      twoCouncil
    );
    expect(locked.status).toBe('InProgress');
    recordConfirmedProtocolProposal('dao.testnet', locked);

    const staleApp: ProtocolApplication = {
      app_id: 'protocol-proposal-7',
      label: 'Signal',
      status: 'approved',
      description: null,
      created_at: '1',
      governance_proposal: {
        proposal_id: 7,
        status: 'InProgress',
        description: 'Signal',
        dao_account: 'dao.testnet',
        tx_hash: null,
        submitted_at: '1',
        snapshot: openProposal(),
      },
    };
    const overlaid = overlayConfirmedProtocolApplication(
      'dao.testnet',
      staleApp
    );
    expect(overlaid.governance_proposal?.snapshot?.status).toBe('InProgress');
    expect(
      overlaid.governance_proposal?.snapshot?.votes?.['alice.testnet']
    ).toBe('Approve');
  });
});

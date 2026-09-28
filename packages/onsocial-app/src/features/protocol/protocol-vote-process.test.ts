import { afterEach, describe, expect, it } from 'vitest';
import {
  applyOptimisticVote,
  applyProtocolProposalSnapshot,
  deriveProtocolProposalView,
  mergeProtocolProposalSnapshot,
  protocolVoteBarModel,
  resolveLiveProposal,
} from '@/features/protocol/protocol-card-view';
import {
  clearConfirmedProtocolProposalLedger,
  overlayConfirmedProtocolProposal,
  recordConfirmedProtocolProposal,
} from '@/features/protocol/protocol-proposal-ledger';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
  ProtocolDaoVote,
} from '@/features/protocol/types';

const DAO = 'governance.onsocial.testnet';

afterEach(() => {
  clearConfirmedProtocolProposalLedger();
});

function council(members: string[], threshold: [number, number] = [50, 100], quorum = '0'): ProtocolDaoPolicy {
  return {
    proposal_period: String(7n * 24n * 60n * 60n * 1_000_000_000n),
    default_vote_policy: {
      quorum,
      threshold,
      weight_kind: 'RoleWeight',
    },
    roles: [
      {
        name: 'guardians',
        kind: { Group: members },
        permissions: ['*:VoteApprove', '*:VoteReject', '*:VoteRemove', '*:Finalize'],
      },
    ],
  };
}

function applicationFor(proposal: ProtocolDaoProposal): ProtocolApplication {
  return {
    app_id: `protocol-proposal-${proposal.id}`,
    label: 'Proposal',
    status: 'approved',
    description: null,
    created_at: '1',
    governance_proposal: {
      proposal_id: proposal.id ?? null,
      status: proposal.status,
      proposer: proposal.proposer,
      description: proposal.description,
      dao_account: DAO,
      tx_hash: null,
      submitted_at: proposal.submission_time,
      kind: proposal.kind,
      snapshot: proposal,
    },
  };
}

function openProposal(
  members: string[],
  votes: Record<string, ProtocolDaoVote> = {}
): ProtocolDaoProposal {
  const approvals = Object.values(votes).filter((vote) => vote === 'Approve').length;
  const rejects = Object.values(votes).filter((vote) => vote === 'Reject').length;
  const removes = Object.values(votes).filter((vote) => vote === 'Remove').length;
  return {
    id: 44,
    proposer: members[0] ?? 'proposer.testnet',
    description: 'Ship the upgrade',
    kind: { Vote: {} },
    status: 'InProgress',
    vote_counts: {
      guardians: [String(approvals), String(rejects), String(removes)],
    },
    votes,
    submission_time: String(BigInt(Date.now()) * 1_000_000n),
  };
}

/** Same order as the proposals screen after the wallet confirms. */
function confirmVote(
  application: ProtocolApplication,
  signerId: string,
  vote: ProtocolDaoVote,
  policy: ProtocolDaoPolicy
): ProtocolApplication {
  const live = resolveLiveProposal(application);
  if (!live) throw new Error('missing proposal');
  const optimistic = applyOptimisticVote(live, signerId, vote, policy);
  recordConfirmedProtocolProposal(DAO, optimistic);
  const confirmed = overlayConfirmedProtocolProposal(DAO, optimistic);
  const merged = mergeProtocolProposalSnapshot(live, confirmed);
  if (!merged) throw new Error('merge dropped the vote');
  return applyProtocolProposalSnapshot(application, merged);
}

/** Same order as the live get_proposal refresh after that confirm. */
function adoptChainRead(
  application: ProtocolApplication,
  chain: ProtocolDaoProposal
): ProtocolApplication {
  const overlaid = overlayConfirmedProtocolProposal(DAO, chain);
  const live = resolveLiveProposal(application);
  const merged = mergeProtocolProposalSnapshot(live, overlaid);
  if (!merged) throw new Error('refresh dropped the proposal');
  return applyProtocolProposalSnapshot(application, merged);
}

function screen(application: ProtocolApplication, policy: ProtocolDaoPolicy) {
  const view = deriveProtocolProposalView({
    application,
    accountId: 'alice.testnet',
    daoPolicy: policy,
  });
  const bar = protocolVoteBarModel(view.votingProgress);
  const voted = new Set(view.voteEntries.map(([id]) => id.trim().toLowerCase()));
  return {
    status: view.status,
    bar,
    eligibleVoters: view.eligibleVoters,
    abstainers: view.eligibleVoters.filter(
      (id) => !voted.has(id.trim().toLowerCase())
    ),
  };
}

describe('proposal vote process', () => {
  it('keeps a deciding second-of-three approval on the council through the chain read', () => {
    const members = ['alice.testnet', 'bob.testnet', 'carol.testnet'];
    const policy = council(members);
    let app = applicationFor(
      openProposal(members, { 'bob.testnet': 'Approve' })
    );

    const before = screen(app, policy);
    expect(before.status).toBe('InProgress');
    expect(before.bar.denominator).toBe(3);
    expect(before.bar.approvePct).toBeCloseTo(100 / 3, 5);
    expect(before.abstainers).toEqual(['alice.testnet', 'carol.testnet']);

    app = confirmVote(app, 'alice.testnet', 'Approve', policy);
    const passed = screen(app, policy);
    expect(passed.status).toBe('Approved');
    expect(passed.bar.denominator).toBe(3);
    expect(passed.bar.approvePct).toBeCloseTo(200 / 3, 5);
    expect(passed.bar.approvePct).toBeLessThan(100);
    expect(passed.bar.pendingPct).toBeCloseTo(100 / 3, 5);
    expect(passed.bar.approvePct + passed.bar.pendingPct).toBeCloseTo(100, 5);
    expect(passed.abstainers).toEqual(['carol.testnet']);

    const stale = openProposal(members, { 'bob.testnet': 'Approve' });
    app = adoptChainRead(app, stale);
    const afterStale = screen(app, policy);
    expect(afterStale.status).toBe('Approved');
    expect(afterStale.bar.denominator).toBe(3);
    expect(afterStale.bar.approvePct).toBeCloseTo(200 / 3, 5);
    expect(afterStale.abstainers).toEqual(['carol.testnet']);

    const chainStillOpen: ProtocolDaoProposal = {
      ...resolveLiveProposal(app)!,
      status: 'InProgress',
      policy_snapshot: null,
    };
    app = adoptChainRead(app, chainStillOpen);
    const whileChainOpen = screen(app, policy);
    expect(whileChainOpen.status).toBe('Approved');
    expect(whileChainOpen.bar.denominator).toBe(3);
    expect(whileChainOpen.bar.approvePct).toBeCloseTo(200 / 3, 5);

    const chainApproved: ProtocolDaoProposal = {
      ...resolveLiveProposal(app)!,
      status: 'Approved',
      policy_snapshot: policy,
    };
    app = adoptChainRead(app, chainApproved);
    const settled = screen(app, policy);
    expect(settled.status).toBe('Approved');
    expect(settled.bar.denominator).toBe(3);
    expect(settled.bar.approvePct).toBeCloseTo(200 / 3, 5);
    expect(settled.eligibleVoters).toEqual([
      'alice.testnet',
      'bob.testnet',
      'carol.testnet',
    ]);
  });

  it('stops a deciding vote on councils of several sizes', () => {
    for (const size of [1, 2, 3, 5, 7, 12]) {
      const members = Array.from(
        { length: size },
        (_, index) => `member${index}.testnet`
      );
      const policy = council(members);
      let app = applicationFor(openProposal(members));
      let cast = 0;
      while (screen(app, policy).status !== 'Approved' && cast < size) {
        app = confirmVote(app, members[cast]!, 'Approve', policy);
        cast += 1;
        const frame = screen(app, policy);
        expect(frame.bar.denominator, `size ${size} after ${cast}`).toBe(size);
        expect(frame.bar.approvePct, `size ${size} after ${cast}`).toBeCloseTo(
          (cast / size) * 100,
          5
        );
        expect(frame.bar.approvePct, `size ${size} after ${cast}`).toBeLessThanOrEqual(
          100
        );
      }
      const done = screen(app, policy);
      expect(done.status, `size ${size}`).toBe('Approved');
      expect(done.eligibleVoters, `size ${size}`).toEqual(
        [...members].sort((left, right) => left.localeCompare(right))
      );
      expect(done.abstainers.length, `size ${size}`).toBe(size - cast);
    }
  });

  it('does not pass a vote early when the kind policy or quorum still needs more members', () => {
    const members = ['alice.testnet', 'bob.testnet', 'carol.testnet'];
    const unanimous: ProtocolDaoPolicy = {
      ...council(members, [1, 1]),
      roles: [
        {
          name: 'guardians',
          kind: { Group: members },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
          vote_policy: {
            vote: {
              quorum: '0',
              threshold: [1, 1],
              weight_kind: 'RoleWeight',
            },
          },
        },
      ],
    };
    let app = applicationFor(
      openProposal(members, { 'bob.testnet': 'Approve' })
    );
    app = confirmVote(app, 'alice.testnet', 'Approve', unanimous);
    const held = screen(app, unanimous);
    expect(held.status).toBe('InProgress');
    expect(held.bar.denominator).toBe(3);
    expect(held.bar.approvePct).toBeCloseTo(200 / 3, 5);

    const quorumPolicy = council(members, [1, 100], '3');
    let quorumApp = applicationFor(
      openProposal(members, { 'bob.testnet': 'Approve' })
    );
    quorumApp = confirmVote(quorumApp, 'alice.testnet', 'Approve', quorumPolicy);
    const waiting = screen(quorumApp, quorumPolicy);
    expect(waiting.status).toBe('InProgress');
    expect(waiting.bar.denominator).toBe(3);
    expect(waiting.bar.approvePct).toBeCloseTo(200 / 3, 5);
  });

  it('keeps an early reject and a passing remove on the full council', () => {
    const members = Array.from({ length: 6 }, (_, index) => `member${index}.testnet`);
    const policy = council(members);
    let app = applicationFor(openProposal(members));
    let rejects = 0;
    while (screen(app, policy).status === 'InProgress' && rejects < 6) {
      app = confirmVote(app, members[rejects]!, 'Reject', policy);
      rejects += 1;
    }
    const failed = screen(app, policy);
    expect(failed.status).toBe('Rejected');
    expect(failed.bar.denominator).toBe(6);
    expect(failed.bar.rejectPct).toBeCloseTo((rejects / 6) * 100, 5);
    expect(rejects).toBeLessThan(6);

    const trio = ['alice.testnet', 'bob.testnet', 'carol.testnet'];
    const removePolicy = council(trio);
    let removeApp = applicationFor({
      ...openProposal(trio, { 'bob.testnet': 'Remove' }),
      kind: { Vote: {} },
      vote_counts: { guardians: ['0', '0', '1'] },
    });
    removeApp = confirmVote(removeApp, 'alice.testnet', 'Remove', removePolicy);
    const removed = screen(removeApp, removePolicy);
    expect(removed.status).toBe('Removed');
    expect(removed.bar.denominator).toBe(3);
    expect(removed.bar.removePct).toBeCloseTo(200 / 3, 5);
    expect(removed.abstainers).toEqual(['carol.testnet']);
  });
});

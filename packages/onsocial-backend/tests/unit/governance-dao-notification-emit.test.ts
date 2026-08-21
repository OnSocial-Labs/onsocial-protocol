import { describe, expect, it } from 'vitest';
import { planDaoProposalNotifications } from '../../src/services/governance-dao-notification-plan.js';

describe('planDaoProposalNotifications', () => {
  const members = ['alice.testnet', 'bob.testnet', 'carol.testnet'];

  it('fans out create to members excluding the proposer', () => {
    const plans = planDaoProposalNotifications({
      daoAccountId: 'gov.sputnik-dao.testnet',
      previous: null,
      next: {
        id: 12,
        proposer: 'bob.testnet',
        description: 'Fund builders\nMore detail',
        kind: { Transfer: {} },
        status: 'InProgress',
      },
      memberAccountIds: members,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      type: 'dao_proposal',
      actor: 'bob.testnet',
      recipients: ['alice.testnet', 'carol.testnet'],
      dedupeKey: 'dao:gov.sputnik-dao.testnet:proposal:12:created',
      context: {
        daoAccountId: 'gov.sputnik-dao.testnet',
        proposalId: 12,
        status: 'InProgress',
        kind: 'Transfer',
        description: 'Fund builders',
      },
    });
  });

  it('fans out terminal status change to all members', () => {
    const plans = planDaoProposalNotifications({
      daoAccountId: 'gov.sputnik-dao.testnet',
      previous: { status: 'InProgress' },
      next: {
        id: 12,
        proposer: 'bob.testnet',
        description: 'Fund builders',
        kind: { Transfer: {} },
        status: 'Approved',
      },
      memberAccountIds: members,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      type: 'dao_proposal_resolved',
      actor: 'gov.sputnik-dao.testnet',
      recipients: ['alice.testnet', 'bob.testnet', 'carol.testnet'],
      dedupeKey: 'dao:gov.sputnik-dao.testnet:proposal:12:status:Approved',
      context: { status: 'Approved' },
    });
  });

  it('notifies the proposer when someone casts or changes a vote', () => {
    const plans = planDaoProposalNotifications({
      daoAccountId: 'gov.sputnik-dao.testnet',
      previous: {
        status: 'InProgress',
        votes: { 'alice.testnet': 'Approve' },
      },
      next: {
        id: 12,
        proposer: 'bob.testnet',
        description: 'Fund builders',
        kind: { Transfer: {} },
        status: 'InProgress',
        votes: {
          'alice.testnet': 'Approve',
          'carol.testnet': 'Reject',
        },
      },
      memberAccountIds: members,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      type: 'dao_proposal_vote',
      actor: 'carol.testnet',
      recipients: ['bob.testnet'],
      dedupeKey:
        'dao:gov.sputnik-dao.testnet:proposal:12:vote:carol.testnet:Reject',
      context: {
        vote: 'Reject',
        proposalId: 12,
        description: 'Fund builders',
      },
    });
  });

  it('skips self-votes and unchanged vote maps', () => {
    expect(
      planDaoProposalNotifications({
        daoAccountId: 'gov.sputnik-dao.testnet',
        previous: { status: 'InProgress', votes: {} },
        next: {
          id: 12,
          proposer: 'bob.testnet',
          description: 'Fund builders',
          kind: { Transfer: {} },
          status: 'InProgress',
          votes: { 'bob.testnet': 'Approve' },
        },
        memberAccountIds: members,
      })
    ).toEqual([]);

    expect(
      planDaoProposalNotifications({
        daoAccountId: 'gov.sputnik-dao.testnet',
        previous: {
          status: 'InProgress',
          votes: { 'alice.testnet': 'Approve' },
        },
        next: {
          id: 12,
          proposer: 'bob.testnet',
          description: 'Fund builders',
          kind: { Transfer: {} },
          status: 'InProgress',
          votes: { 'alice.testnet': 'Approve' },
        },
        memberAccountIds: members,
      })
    ).toEqual([]);
  });

  it('emits vote and resolve together when a deciding vote lands', () => {
    const plans = planDaoProposalNotifications({
      daoAccountId: 'gov.sputnik-dao.testnet',
      previous: {
        status: 'InProgress',
        votes: { 'alice.testnet': 'Approve' },
      },
      next: {
        id: 12,
        proposer: 'bob.testnet',
        description: 'Fund builders',
        kind: { Transfer: {} },
        status: 'Approved',
        votes: {
          'alice.testnet': 'Approve',
          'carol.testnet': 'Approve',
        },
      },
      memberAccountIds: members,
    });

    expect(plans.map((plan) => plan.type)).toEqual([
      'dao_proposal_vote',
      'dao_proposal_resolved',
    ]);
  });

  it('skips no-op status refreshes and non-terminal transitions', () => {
    expect(
      planDaoProposalNotifications({
        daoAccountId: 'gov.sputnik-dao.testnet',
        previous: { status: 'Approved' },
        next: {
          id: 12,
          proposer: 'bob.testnet',
          description: 'Fund builders',
          kind: { Transfer: {} },
          status: 'Approved',
        },
        memberAccountIds: members,
      })
    ).toEqual([]);

    expect(
      planDaoProposalNotifications({
        daoAccountId: 'gov.sputnik-dao.testnet',
        previous: { status: 'InProgress' },
        next: {
          id: 12,
          proposer: 'bob.testnet',
          description: 'Fund builders',
          kind: { Transfer: {} },
          status: 'InProgress',
        },
        memberAccountIds: members,
      })
    ).toEqual([]);
  });
});

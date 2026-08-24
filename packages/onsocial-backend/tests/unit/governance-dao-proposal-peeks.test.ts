import { describe, expect, it } from 'vitest';
import {
  isOpenDaoProposalPeekStatus,
  mapStoredRowToDaoProposalPeek,
  normalizeDaoProposalPeekDaoIds,
  peekLabelFromSnapshot,
} from '../../src/services/governance-dao-proposal-peeks.js';
import type { StoredDaoProposalRow } from '../../src/services/governance-dao-proposal-store.js';

function row(
  overrides: Partial<StoredDaoProposalRow> &
    Pick<StoredDaoProposalRow, 'daoAccountId' | 'proposalId' | 'status'>
): StoredDaoProposalRow {
  return {
    submissionTime: '1700000000000000000',
    submissionBlockHeight: null,
    resolvedBlockHeight: null,
    resolvedAt: null,
    proposalSnapshot: {
      id: overrides.proposalId,
      proposer: 'alice.testnet',
      description: 'Fund runway\nMore detail',
      kind: { Transfer: {} },
      status: overrides.status,
      vote_counts: {},
      votes: {},
      submission_time: '1700000000000000000',
    },
    policySnapshot: null,
    syncedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('governance-dao-proposal-peeks', () => {
  it('normalizes and caps dao ids', () => {
    expect(
      normalizeDaoProposalPeekDaoIds([
        'Alice.Near',
        'alice.near',
        'bob.near',
        '',
        'bad id',
      ])
    ).toEqual(['alice.near', 'bob.near']);
  });

  it('detects open statuses', () => {
    expect(isOpenDaoProposalPeekStatus('InProgress')).toBe(true);
    expect(isOpenDaoProposalPeekStatus('open')).toBe(true);
    expect(isOpenDaoProposalPeekStatus('Approved')).toBe(false);
  });

  it('builds kind-aware labels from the feed headline helper', () => {
    expect(
      peekLabelFromSnapshot(
        row({ daoAccountId: 'a.near', proposalId: 3, status: 'InProgress' })
      )
    ).toBe('Treasury transfer');
    expect(
      peekLabelFromSnapshot(
        row({
          daoAccountId: 'a.near',
          proposalId: 9,
          status: 'InProgress',
          proposalSnapshot: {
            id: 9,
            proposer: 'alice.testnet',
            description: '   ',
            kind: {},
            status: 'InProgress',
            vote_counts: {},
            votes: {},
            submission_time: '',
          },
        })
      )
    ).toBe('Governance proposal');
  });

  it('maps stored rows with catalog names', () => {
    const peek = mapStoredRowToDaoProposalPeek(
      row({ daoAccountId: 'dao.near', proposalId: 7, status: 'InProgress' }),
      new Map([['dao.near', 'Cool DAO']])
    );
    expect(peek).toMatchObject({
      daoAccountId: 'dao.near',
      daoName: 'Cool DAO',
      proposalId: 7,
      proposer: 'alice.testnet',
      label: 'Treasury transfer',
      status: 'InProgress',
      open: true,
    });
    expect(peek.createdAt).toMatch(/^\d{4}-/);
  });
});

import { describe, expect, it } from 'vitest';
import type { GovernanceEventRow, GroupMemberRow } from '@onsocial/sdk';
import {
  deriveGuildProposalAbstainers,
  deriveGuildProposalVoteEntries,
} from '@/features/guilds/guild-proposal-voters';

function voteRow(
  voter: string,
  approve: boolean,
  votedAt: number | null = 1
): GovernanceEventRow {
  return { voter, approve, votedAt } as GovernanceEventRow;
}

function memberRow(memberId: string): GroupMemberRow {
  return { memberId } as GroupMemberRow;
}

describe('deriveGuildProposalVoteEntries', () => {
  it('keeps the latest vote per voter and skips malformed rows', () => {
    const entries = deriveGuildProposalVoteEntries([
      voteRow('alice.testnet', true, 1),
      voteRow('bob.testnet', false, 2),
      voteRow('alice.testnet', false, 3),
      voteRow('', true),
      voteRow('carol.testnet', null as unknown as boolean),
    ]);

    expect(entries).toEqual([
      { voter: 'alice.testnet', approve: false, votedAt: 3 },
      { voter: 'bob.testnet', approve: false, votedAt: 2 },
    ]);
  });
});

describe('deriveGuildProposalAbstainers', () => {
  it('lists members who never voted, deduped and case-insensitive', () => {
    const entries = deriveGuildProposalVoteEntries([
      voteRow('Alice.Testnet', true),
    ]);
    const abstainers = deriveGuildProposalAbstainers(
      [
        memberRow('alice.testnet'),
        memberRow('bob.testnet'),
        memberRow('bob.testnet'),
        memberRow(''),
        memberRow('carol.testnet'),
      ],
      entries
    );

    expect(abstainers).toEqual(['bob.testnet', 'carol.testnet']);
  });
});

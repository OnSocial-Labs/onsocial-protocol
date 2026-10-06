import type { GovernanceEventRow, GroupMemberRow } from '@onsocial/sdk';

export interface GuildProposalVoteEntry {
  voter: string;
  approve: boolean;
  votedAt: number | null;
}

/**
 * Latest vote per voter — `vote_cast` events arrive in chronological
 * order and a voter may move their vote while the period is open.
 */
export function deriveGuildProposalVoteEntries(
  rows: GovernanceEventRow[]
): GuildProposalVoteEntry[] {
  const byVoter = new Map<string, GuildProposalVoteEntry>();
  for (const row of rows) {
    const voter = row.voter?.trim();
    if (!voter || row.approve == null) continue;
    byVoter.set(voter, {
      voter,
      approve: row.approve,
      votedAt: row.votedAt ?? null,
    });
  }
  return [...byVoter.values()];
}

/** Members with no vote on record — the pool the quorum readout counts. */
export function deriveGuildProposalAbstainers(
  members: GroupMemberRow[],
  entries: GuildProposalVoteEntry[]
): string[] {
  const voted = new Set(entries.map((entry) => entry.voter.toLowerCase()));
  const seen = new Set<string>();
  const abstainers: string[] = [];
  for (const member of members) {
    const memberId = member.memberId?.trim();
    if (!memberId) continue;
    const key = memberId.toLowerCase();
    if (voted.has(key) || seen.has(key)) continue;
    seen.add(key);
    abstainers.push(memberId);
  }
  return abstainers;
}

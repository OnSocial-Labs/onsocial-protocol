import type { Proposal } from '@onsocial/sdk';
import {
  readPermissionChangeLevel,
  readPermissionChangeTarget,
} from '@/features/guilds/guild-proposal-display';

export interface GuildMemberPendingRole {
  level: number;
  proposalId: string;
}

export function listActivePermissionChangeProposals(
  proposals: Proposal[]
): Map<string, GuildMemberPendingRole> {
  const pending = new Map<string, GuildMemberPendingRole>();

  for (const proposal of proposals) {
    if (proposal.status !== 'active') continue;
    const target = readPermissionChangeTarget(proposal);
    const level = readPermissionChangeLevel(proposal);
    if (!target || level == null || level <= 0) continue;
    pending.set(target, { level, proposalId: proposal.id });
  }

  return pending;
}

export function pendingGuildMemberRoleLabel(level: number): string {
  if (level >= 3) return 'Admin vote pending';
  if (level >= 2) return 'Mod vote pending';
  return 'Role vote pending';
}

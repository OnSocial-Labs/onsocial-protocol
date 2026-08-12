import { PERMISSION } from '@onsocial/sdk';
import type { GroupMemberRow } from '@onsocial/sdk';
import type { GuildMemberRowActionId } from '@/features/guilds/guild-member-row-actions';

export function readGuildOwnerId(
  config: Record<string, unknown> | null | undefined
): string | null {
  const owner = typeof config?.owner === 'string' ? config.owner.trim() : '';
  return owner || null;
}

export function guildMemberRolesFromPermissionLevel(level: number): {
  level: number;
  isAdmin: boolean;
  canModerate: boolean;
} {
  return {
    level,
    isAdmin: level >= PERMISSION.MANAGE,
    canModerate: level >= PERMISSION.MODERATE,
  };
}

/**
 * Indexer membership rows can omit or stale `isOwner`. Prefer shell/config
 * owner when known so roster filters and badges stay correct.
 */
export function reconcileGuildMemberRoster(
  members: GroupMemberRow[],
  ownerId: string | null | undefined
): GroupMemberRow[] {
  const owner = ownerId?.trim();
  if (!owner) return members;

  return members.map((member) => {
    const isOwner = member.memberId === owner;
    if (!isOwner && !member.isOwner) return member;

    return {
      ...member,
      isOwner,
      isAdmin: isOwner ? true : member.isAdmin,
      canModerate: isOwner ? true : member.canModerate,
    };
  });
}

/**
 * Members who need an allowlist grant to share. Owner and guild admins already
 * can post to allowlist rooms — never offer them in the picker.
 */
export function allowlistWriterCandidates(
  members: GroupMemberRow[],
  ownerId?: string | null
): GroupMemberRow[] {
  const owner = ownerId?.trim() ?? null;
  return members.filter((member) => {
    if (owner && member.memberId === owner) return false;
    if (member.isOwner || member.isAdmin) return false;
    return true;
  });
}

/**
 * Owner + admins who can always share in allowlist rooms (locked list rows).
 * Owner first, then admins by memberId.
 */
export function allowlistLeaders(
  members: GroupMemberRow[],
  ownerId?: string | null
): GroupMemberRow[] {
  const owner = ownerId?.trim() ?? null;
  return members
    .filter((member) => {
      if (owner && member.memberId === owner) return true;
      return Boolean(member.isOwner || member.isAdmin);
    })
    .sort((a, b) => {
      const aOwner = Boolean(
        (owner && a.memberId === owner) || a.isOwner
      );
      const bOwner = Boolean(
        (owner && b.memberId === owner) || b.isOwner
      );
      if (aOwner !== bOwner) return aOwner ? -1 : 1;
      return a.memberId.localeCompare(b.memberId);
    });
}

export function applyGuildMemberActionToRow(
  member: GroupMemberRow,
  actionId: GuildMemberRowActionId
): GroupMemberRow | null {
  switch (actionId) {
    case 'make-mod':
    case 'demote-to-mod':
      return {
        ...member,
        ...guildMemberRolesFromPermissionLevel(PERMISSION.MODERATE),
      };
    case 'make-admin':
      return {
        ...member,
        ...guildMemberRolesFromPermissionLevel(PERMISSION.MANAGE),
      };
    case 'remove-mod':
    case 'make-member':
    case 'remove-admin':
      return {
        ...member,
        ...guildMemberRolesFromPermissionLevel(PERMISSION.WRITE),
      };
    case 'remove-from-guild':
    case 'ban-from-guild':
      return null;
    case 'unban-from-guild':
      return member;
    default:
      return member;
  }
}

export function patchGuildMemberRosterAction(
  members: GroupMemberRow[],
  memberId: string,
  actionId: GuildMemberRowActionId
): GroupMemberRow[] {
  const next: GroupMemberRow[] = [];

  for (const member of members) {
    if (member.memberId !== memberId) {
      next.push(member);
      continue;
    }

    const patched = applyGuildMemberActionToRow(member, actionId);
    if (patched) next.push(patched);
  }

  return next;
}

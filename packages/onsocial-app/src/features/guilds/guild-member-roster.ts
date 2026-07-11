import type { OnSocial } from '@onsocial/sdk';
import { PERMISSION } from '@onsocial/sdk';
import type { GroupMemberRow } from '@onsocial/sdk';
import type { GuildMemberRowActionId } from '@/features/guilds/guild-member-row-actions';

const ROLE_FLAG_FETCH_CHUNK = 12;

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
 * Indexer membership rows can omit or stale `isOwner`. Chain config owner is
 * authoritative for the single guild owner in roster filters and badges.
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

export interface GuildMemberRoleFlags {
  isAdmin: boolean;
  canModerate: boolean;
}

/**
 * Owner-led grants and member-driven `permission_change` proposals can diverge
 * from indexer membership flags. Prefer chain role views when available.
 */
export function reconcileGuildMemberRolesFromChain(
  members: GroupMemberRow[],
  ownerId: string | null | undefined,
  roleFlags: ReadonlyMap<string, GuildMemberRoleFlags>
): GroupMemberRow[] {
  const owner = ownerId?.trim();

  return members.map((member) => {
    if (owner && member.memberId === owner) return member;

    const chain = roleFlags.get(member.memberId);
    if (!chain) return member;

    const chainLevel = chain.isAdmin
      ? PERMISSION.MANAGE
      : chain.canModerate
        ? PERMISSION.MODERATE
        : PERMISSION.WRITE;

    return {
      ...member,
      level: Math.max(member.level ?? 0, chainLevel),
      isAdmin: member.isAdmin || chain.isAdmin,
      canModerate: member.canModerate || chain.canModerate,
    };
  });
}

export async function fetchGuildMemberRoleFlags(
  client: OnSocial,
  groupId: string,
  memberIds: readonly string[]
): Promise<Map<string, GuildMemberRoleFlags>> {
  const flags = new Map<string, GuildMemberRoleFlags>();

  for (let index = 0; index < memberIds.length; index += ROLE_FLAG_FETCH_CHUNK) {
    const chunk = memberIds.slice(index, index + ROLE_FLAG_FETCH_CHUNK);
    const rows = await Promise.all(
      chunk.map(async (memberId) => {
        try {
          const [isAdmin, canModerate] = await Promise.all([
            client.groups.isAdmin(groupId, memberId),
            client.groups.canModerate(groupId, memberId),
          ]);
          return [memberId, { isAdmin, canModerate }] as const;
        } catch {
          return [memberId, { isAdmin: false, canModerate: false }] as const;
        }
      })
    );

    for (const [memberId, role] of rows) {
      flags.set(memberId, role);
    }
  }

  return flags;
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
      return null;
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

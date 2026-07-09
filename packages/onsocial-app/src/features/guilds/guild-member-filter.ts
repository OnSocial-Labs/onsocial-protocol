import type { GroupMemberRow } from '@onsocial/sdk';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { displayName } from '@/lib/profile-display';

export type GuildMemberRoleBucket = 'owner' | 'admin' | 'moderator' | 'member';

export type GuildMemberRoleFilter = 'all' | GuildMemberRoleBucket;

export const GUILD_MEMBER_ROLE_FILTERS: Array<{
  id: GuildMemberRoleFilter;
  label: string;
}> = [
  { id: 'all', label: 'All members' },
  { id: 'owner', label: 'Owner' },
  { id: 'admin', label: 'Admins' },
  { id: 'moderator', label: 'Mods' },
  { id: 'member', label: 'Members' },
];

export function guildMemberRoleBucket(
  member: Pick<GroupMemberRow, 'isOwner' | 'isAdmin' | 'canModerate'>
): GuildMemberRoleBucket {
  if (member.isOwner) return 'owner';
  if (member.isAdmin) return 'admin';
  if (member.canModerate) return 'moderator';
  return 'member';
}

export function guildMemberMatchesRoleFilter(
  member: Pick<GroupMemberRow, 'isOwner' | 'isAdmin' | 'canModerate'>,
  filter: GuildMemberRoleFilter
): boolean {
  if (filter === 'all') return true;
  return guildMemberRoleBucket(member) === filter;
}

export function guildMemberMatchesSearch(
  member: GroupMemberRow,
  profile: PostAuthorProfile | undefined,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const name = (profile?.displayName ?? displayName(member.memberId)).toLowerCase();
  const handle = member.memberId.toLowerCase();
  return name.includes(normalized) || handle.includes(normalized);
}

export function countGuildMembersByRoleFilter(
  members: GroupMemberRow[],
  filter: GuildMemberRoleFilter
): number {
  if (filter === 'all') return members.length;
  return members.filter((member) => guildMemberMatchesRoleFilter(member, filter))
    .length;
}

export function filterGuildMembers(
  members: GroupMemberRow[],
  profiles: Record<string, PostAuthorProfile>,
  options: { roleFilter: GuildMemberRoleFilter; query: string }
): GroupMemberRow[] {
  return members.filter((member) => {
    if (!guildMemberMatchesRoleFilter(member, options.roleFilter)) return false;
    return guildMemberMatchesSearch(
      member,
      profiles[member.memberId],
      options.query
    );
  });
}

export function guildMemberFilterLabel(filter: GuildMemberRoleFilter): string {
  return (
    GUILD_MEMBER_ROLE_FILTERS.find((option) => option.id === filter)?.label ??
    'All members'
  );
}

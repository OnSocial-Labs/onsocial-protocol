import type { GroupMemberRow } from '@onsocial/sdk';

export function guildMemberRoleLabel(
  member: Pick<GroupMemberRow, 'isOwner' | 'isAdmin' | 'canModerate'>
): string {
  if (member.isOwner) return 'Owner';
  if (member.isAdmin) return 'Admin';
  if (member.canModerate) return 'Moderator';
  return 'Member';
}

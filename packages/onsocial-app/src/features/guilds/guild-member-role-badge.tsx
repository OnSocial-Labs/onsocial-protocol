import type { GroupMemberRow } from '@onsocial/sdk';
import { guildMemberRoleBucket } from '@/features/guilds/guild-member-filter';
import { pendingGuildMemberRoleLabel } from '@/features/guilds/guild-member-pending-roles';
import { guildMemberRoleLabel } from '@/features/guilds/guild-member-role';

export function GuildMemberRoleBadge({
  member,
  pendingRoleLevel,
}: {
  member: Pick<GroupMemberRow, 'isOwner' | 'isAdmin' | 'canModerate'>;
  pendingRoleLevel?: number | null;
}) {
  const bucket = guildMemberRoleBucket(member);
  if (bucket !== 'member') {
    return (
      <span className="os-surface-row-badge guild-member-role-badge">
        {guildMemberRoleLabel(member)}
      </span>
    );
  }

  if (pendingRoleLevel != null && pendingRoleLevel > 0) {
    return (
      <span className="os-surface-row-badge guild-member-role-badge guild-member-role-badge--pending">
        {pendingGuildMemberRoleLabel(pendingRoleLevel)}
      </span>
    );
  }

  return null;
}

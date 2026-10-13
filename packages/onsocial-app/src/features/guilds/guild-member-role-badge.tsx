import type { GroupMemberRow } from '@onsocial/sdk';
import { guildMemberRoleBucket } from '@/features/guilds/guild-member-filter';
import { pendingGuildMemberRoleLabel } from '@/features/guilds/guild-member-pending-roles';
import { guildMemberRoleLabel } from '@/features/guilds/guild-member-role';
import { RosterRoleBadge } from '@/features/guilds/roster-role-badge';

export function GuildMemberRoleBadge({
  member,
  pendingRoleLevel,
}: {
  member: Pick<GroupMemberRow, 'isOwner' | 'isAdmin' | 'canModerate'>;
  pendingRoleLevel?: number | null;
}) {
  const bucket = guildMemberRoleBucket(member);
  if (bucket !== 'member') {
    return <RosterRoleBadge label={guildMemberRoleLabel(member)} />;
  }

  if (pendingRoleLevel != null && pendingRoleLevel > 0) {
    return (
      <RosterRoleBadge
        label={pendingGuildMemberRoleLabel(pendingRoleLevel)}
        pending
      />
    );
  }

  return null;
}

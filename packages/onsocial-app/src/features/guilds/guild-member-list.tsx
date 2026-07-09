'use client';

import Link from 'next/link';
import type { GroupMemberRow } from '@onsocial/sdk';
import { Divider, ProfileAvatar } from '@onsocial/ui';
import { GuildMemberRoleBadge } from '@/features/guilds/guild-member-role-badge';
import { guildMemberRoleBucket } from '@/features/guilds/guild-member-filter';
import { GuildMemberRowMenu } from '@/features/guilds/guild-member-row-menu';
import type { GuildMemberPendingRole } from '@/features/guilds/guild-member-pending-roles';
import type {
  GuildMembersManageContext,
  GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import { guildMemberRowActions } from '@/features/guilds/guild-member-row-actions';
import { guildMemberTimeMeta } from '@/features/guilds/guild-member-time-meta';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface GuildMemberListProps {
  groupId: string;
  members: GroupMemberRow[];
  profiles: Record<string, PostAuthorProfile>;
  pendingRolesByMemberId?: Map<string, GuildMemberPendingRole>;
  manageContext?: GuildMembersManageContext | null;
  onMembersChanged?: (input?: {
    memberId: string;
    actionId: GuildMemberRowActionId;
    propose: boolean;
  }) => void;
}

export function GuildMemberList({
  groupId,
  members,
  profiles,
  pendingRolesByMemberId,
  manageContext,
  onMembersChanged,
}: GuildMemberListProps) {
  const showManageMenu = Boolean(manageContext?.viewerAccountId);

  return (
    <div className="standing-list guild-member-list">
      {members.map((member, index) => {
        const profile = profiles[member.memberId];
        const name = profile?.displayName ?? displayName(member.memberId);
        const handle = fallbackLabel(member.memberId);
        const timeMeta = guildMemberTimeMeta(member.blockTimestamp, {
          isOwner: member.isOwner,
        });
        const href = portfolioPath(member.memberId);
        const pendingRoleLevel =
          pendingRolesByMemberId?.get(member.memberId)?.level ?? null;
        const showRoleBadge =
          guildMemberRoleBucket(member) !== 'member' ||
          (pendingRoleLevel != null && pendingRoleLevel > 0);
        const rowActions =
          showManageMenu && manageContext
            ? guildMemberRowActions(member, manageContext)
            : [];
        const showRowMenu = rowActions.length > 0;
        const asideEmpty = !timeMeta && !showRowMenu;

        return (
          <div key={member.memberId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row guild-member-row">
              <Link href={href} className="standing-row-main" scroll={false}>
                <ProfileAvatar
                  src={profile?.avatarUrl ?? null}
                  fallbackInitial={name}
                  size="lg"
                  className="standing-row-avatar-slot"
                />
                <div className="standing-row-copy">
                  <span className="standing-row-head">
                    <span className="standing-row-name-row guild-member-row-name-row">
                      <span className="standing-row-name">{name}</span>
                      {showRoleBadge ? (
                        <GuildMemberRoleBadge
                          member={member}
                          pendingRoleLevel={pendingRoleLevel}
                        />
                      ) : null}
                    </span>
                    <span className="standing-row-handle">@{handle}</span>
                  </span>
                </div>
              </Link>

              <div
                className={`standing-row-aside guild-member-row-aside${
                  asideEmpty ? ' is-empty' : ''
                }`}
              >
                {timeMeta ? (
                  <span
                    className="standing-row-time"
                    aria-label={timeMeta.description}
                  >
                    {timeMeta.label}
                  </span>
                ) : null}
                {showRowMenu && manageContext ? (
                  <GuildMemberRowMenu
                    groupId={groupId}
                    member={member}
                    manageContext={manageContext}
                    memberLabel={name}
                    onActionComplete={onMembersChanged}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

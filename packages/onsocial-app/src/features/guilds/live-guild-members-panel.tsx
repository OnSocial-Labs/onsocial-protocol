'use client';

import { useEffect } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { GuildMembersRoster } from '@/features/guilds/guild-members-roster';
import { guildPath } from '@/features/guilds/guilds-data';
import { useGuildMembersData } from '@/features/guilds/use-guild-members-data';
import { useGuildMembersManageContext } from '@/features/guilds/use-guild-members-manage-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import type { GuildMembersPageData } from '@/lib/load-guild-members-page';

interface LiveGuildMembersPanelProps {
  groupId: string;
  initial?: GuildMembersPageData | null;
}

export function LiveGuildMembersPanel({
  groupId,
  initial = null,
}: LiveGuildMembersPanelProps) {
  const memberDriven = Boolean(initial?.memberDriven);
  const {
    members,
    pendingRolesByMemberId,
    loadError,
    showListSkeleton,
    isListRefreshing,
    countsLoading,
    bootstrap,
    reload,
    applyMemberActionPatch,
  } = useGuildMembersData(groupId, {
    memberDriven,
    ownerId: initial?.ownerId ?? null,
  });
  const manageContext = useGuildMembersManageContext(groupId, memberDriven);

  useEffect(() => {
    void bootstrap(initial?.members ?? []);
    // Seed once per group load; soft fetch follows inside bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial seed is mount/group scoped
  }, [bootstrap, groupId]);

  const profiles = usePostAuthorProfiles(
    members.map((member) => member.memberId)
  );

  return (
    <OsAppScreen
      title="Members"
      subtitle={
        countsLoading && members.length === 0
          ? 'Loading members…'
          : `${members.length} ${members.length === 1 ? 'member' : 'members'}`
      }
      backFallbackHref={guildPath(groupId)}
    >
      <GuildMembersRoster
        groupId={groupId}
        members={members}
        profiles={profiles}
        manageContext={manageContext}
        onMembersChanged={(input) => {
          if (input?.propose || input?.actionId === 'transfer-ownership') {
            reload();
          } else if (input) {
            applyMemberActionPatch(input.memberId, input.actionId);
          } else {
            reload();
          }
        }}
        pendingRolesByMemberId={pendingRolesByMemberId}
        loadError={loadError}
        showListSkeleton={showListSkeleton}
        isListRefreshing={isListRefreshing}
        countsLoading={countsLoading}
        onRetry={reload}
      />
    </OsAppScreen>
  );
}

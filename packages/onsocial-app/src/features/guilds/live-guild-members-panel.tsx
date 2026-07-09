'use client';

import { useEffect, useState } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { GuildMembersRoster } from '@/features/guilds/guild-members-roster';
import { guildPath } from '@/features/guilds/guilds-data';
import { useGuildMembersData } from '@/features/guilds/use-guild-members-data';
import { useGuildMembersManageContext } from '@/features/guilds/use-guild-members-manage-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

interface LiveGuildMembersPanelProps {
  groupId: string;
}

export function LiveGuildMembersPanel({ groupId }: LiveGuildMembersPanelProps) {
  const [memberDriven, setMemberDriven] = useState(false);
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
  } = useGuildMembersData(groupId, { memberDriven });
  const manageContext = useGuildMembersManageContext(groupId, memberDriven);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const config = await client.groups.getConfig(groupId);
        if (cancelled || !config) return;
        setMemberDriven(
          config.member_driven === true || config.memberDriven === true
        );
      } catch {
        if (!cancelled) setMemberDriven(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const profiles = usePostAuthorProfiles(members.map((member) => member.memberId));

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

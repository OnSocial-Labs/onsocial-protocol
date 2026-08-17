'use client';

import { useEffect, useState } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { GuildGroupStorageSheet } from '@/features/guilds/guild-group-storage-sheet';
import {
  canViewerManageGuildMembers,
} from '@/features/guilds/guild-member-row-actions';
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
    banned,
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
  const [groupStorageSheetOpen, setGroupStorageSheetOpen] = useState(false);
  const [groupStorageRecipient, setGroupStorageRecipient] = useState<
    string | null
  >(null);
  const canManageStorage = canViewerManageGuildMembers(manageContext);

  useEffect(() => {
    void bootstrap(initial?.members ?? [], initial?.banned ?? []);
    // Seed once per group load; soft fetch follows inside bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial seed is mount/group scoped
  }, [bootstrap, groupId]);

  const profiles = usePostAuthorProfiles([
    ...members.map((member) => member.memberId),
    ...banned.map((row) => row.memberId),
  ]);

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
        banned={banned}
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
        onAddStorage={
          canManageStorage
            ? (memberId) => {
                setGroupStorageRecipient(memberId);
                setGroupStorageSheetOpen(true);
              }
            : undefined
        }
        pendingRolesByMemberId={pendingRolesByMemberId}
        loadError={loadError}
        showListSkeleton={showListSkeleton}
        isListRefreshing={isListRefreshing}
        countsLoading={countsLoading}
        onRetry={reload}
      />
      {canManageStorage ? (
        <GuildGroupStorageSheet
          open={groupStorageSheetOpen}
          groupId={groupId}
          initialRecipient={groupStorageRecipient}
          onClose={() => {
            setGroupStorageSheetOpen(false);
            setGroupStorageRecipient(null);
          }}
        />
      ) : null}
    </OsAppScreen>
  );
}

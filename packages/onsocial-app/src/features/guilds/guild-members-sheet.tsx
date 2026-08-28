'use client';

import { useEffect, useRef, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import { GlassSheet, SheetHeader } from '@onsocial/ui';
import type { GuildMemberRoleFilter } from '@/features/guilds/guild-member-filter';
import {
  canViewerManageGuildMembers,
  type GuildMembersManageContext,
  type GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import {
  GuildMembersRoster,
  GuildMembersRosterToolbar,
} from '@/features/guilds/guild-members-roster';
import { useGuildMembersData } from '@/features/guilds/use-guild-members-data';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildMembersSheetProps {
  open: boolean;
  groupId: string;
  seedMembers?: GroupMemberRow[];
  manageContext: GuildMembersManageContext;
  onClose: () => void;
  onMembersChanged?: () => void;
  onAddStorage?: (memberId: string) => void;
}

export function GuildMembersSheet({
  open,
  groupId,
  seedMembers = [],
  manageContext,
  onClose,
  onMembersChanged,
  onAddStorage,
}: GuildMembersSheetProps) {
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
  } = useGuildMembersData(groupId, { memberDriven: manageContext.memberDriven });
  const [roleFilter, setRoleFilter] = useState<GuildMemberRoleFilter>('all');
  const [query, setQuery] = useState('');
  const seedMembersRef = useRef(seedMembers);
  const showBannedFilter = canViewerManageGuildMembers(manageContext);

  useEffect(() => {
    seedMembersRef.current = seedMembers;
  }, [seedMembers]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setRoleFilter('all');
      setQuery('');
      bootstrap(seedMembersRef.current);
    });
  }, [bootstrap, open]);

  const profiles = usePostAuthorProfiles([
    ...members.map((member) => member.memberId),
    ...banned.map((row) => row.memberId),
  ]);
  const memberCountLabel =
    countsLoading && members.length === 0
      ? 'Loading members…'
      : `${members.length} ${members.length === 1 ? 'member' : 'members'}`;

  const handleMembersChanged = (input?: {
    memberId: string;
    actionId: GuildMemberRowActionId;
    propose: boolean;
  }) => {
    if (input?.propose || input?.actionId === 'transfer-ownership') {
      reload();
    } else if (input) {
      applyMemberActionPatch(input.memberId, input.actionId);
    } else {
      reload();
    }
    onMembersChanged?.();
  };

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      sizing="hug"
      initialDetent="full"
      zIndex={SHEET_Z.facts}
      ariaLabelledBy="guild-members-title"
      backdropLabel="Close members"
      panelClassName="guild-members-sheet-panel os-sheet-cap-standard"
      bodyClassName="guild-members-sheet-body"
      header={
        <>
          <SheetHeader
            titleId="guild-members-title"
            title="Members"
            subtitle={memberCountLabel}
            onClose={onClose}
            closeAriaLabel="Close members"
          />
          <div className="standing-sheet-header guild-members-sheet-chrome">
            {manageContext.memberDriven ? (
              <p className="discover-sheet-subtitle guild-members-sheet-note">
                Role changes require a member vote before they take effect.
              </p>
            ) : null}
            <div className="standing-sheet-toolbar-row">
              <GuildMembersRosterToolbar
                members={members}
                bannedCount={banned.length}
                showBannedFilter={showBannedFilter}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                query={query}
                onQueryChange={setQuery}
                countsLoading={countsLoading}
              />
            </div>
          </div>
        </>
      }
    >
      <GuildMembersRoster
        groupId={groupId}
        members={members}
        banned={banned}
        profiles={profiles}
        manageContext={manageContext}
        onMembersChanged={handleMembersChanged}
        onAddStorage={onAddStorage}
        pendingRolesByMemberId={pendingRolesByMemberId}
        loadError={loadError}
        showListSkeleton={showListSkeleton}
        isListRefreshing={isListRefreshing}
        countsLoading={countsLoading}
        onRetry={reload}
        showToolbar={false}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        query={query}
        onQueryChange={setQuery}
      />
    </GlassSheet>
  );
}

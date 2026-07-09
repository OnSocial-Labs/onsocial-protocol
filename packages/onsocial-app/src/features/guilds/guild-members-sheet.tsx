'use client';

import { useEffect, useRef, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import type { GuildMemberRoleFilter } from '@/features/guilds/guild-member-filter';
import type {
  GuildMembersManageContext,
  GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import {
  GuildMembersRoster,
  GuildMembersRosterToolbar,
} from '@/features/guilds/guild-members-roster';
import { useGuildMembersData } from '@/features/guilds/use-guild-members-data';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';

interface GuildMembersSheetProps {
  open: boolean;
  groupId: string;
  seedMembers?: GroupMemberRow[];
  manageContext: GuildMembersManageContext;
  onClose: () => void;
  onMembersChanged?: () => void;
}

export function GuildMembersSheet({
  open,
  groupId,
  seedMembers = [],
  manageContext,
  onClose,
  onMembersChanged,
}: GuildMembersSheetProps) {
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
  } = useGuildMembersData(groupId, { memberDriven: manageContext.memberDriven });
  const [roleFilter, setRoleFilter] = useState<GuildMemberRoleFilter>('all');
  const [query, setQuery] = useState('');
  const seedMembersRef = useRef(seedMembers);
  seedMembersRef.current = seedMembers;

  useEffect(() => {
    if (!open) return;
    setRoleFilter('all');
    setQuery('');
    bootstrap(seedMembersRef.current);
  }, [bootstrap, open]);

  const profiles = usePostAuthorProfiles(members.map((member) => member.memberId));
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
      initialDetent="full"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy="guild-members-title"
      backdropLabel="Close members"
      panelClassName="guild-members-sheet-panel"
      bodyClassName="guild-members-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-manage-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2
                    id="guild-members-title"
                    className="standing-sheet-subject-name"
                  >
                    Members
                  </h2>
                  <p className="discover-sheet-subtitle">{memberCountLabel}</p>
                  {manageContext.memberDriven ? (
                    <p className="discover-sheet-subtitle guild-members-sheet-note">
                      Role changes require a member vote before they take effect.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={onClose} ariaLabel="Close" />
              </div>
            </div>
            <div className="standing-sheet-toolbar-row">
              <GuildMembersRosterToolbar
                members={members}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                query={query}
                onQueryChange={setQuery}
                countsLoading={countsLoading}
              />
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <GuildMembersRoster
        groupId={groupId}
        members={members}
        profiles={profiles}
        manageContext={manageContext}
        onMembersChanged={handleMembersChanged}
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

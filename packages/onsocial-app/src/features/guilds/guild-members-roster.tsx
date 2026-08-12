'use client';

import { useMemo, useState } from 'react';
import type { GroupBannedRow, GroupMemberRow } from '@onsocial/sdk';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { bannedRowsAsMemberRows } from '@/features/guilds/guild-banned-rows';
import { GuildMemberList } from '@/features/guilds/guild-member-list';
import {
  filterGuildMembers,
  guildMemberFilterLabel,
  guildMemberMatchesSearch,
  type GuildMemberRoleFilter,
} from '@/features/guilds/guild-member-filter';
import { GuildMembersToolbar } from '@/features/guilds/guild-members-toolbar';
import type { GuildMemberPendingRole } from '@/features/guilds/guild-member-pending-roles';
import {
  canViewerManageGuildMembers,
  type GuildMembersManageContext,
  type GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';

interface GuildMembersRosterProps {
  groupId: string;
  members: GroupMemberRow[];
  banned?: GroupBannedRow[];
  profiles: Record<string, PostAuthorProfile>;
  pendingRolesByMemberId?: Map<string, GuildMemberPendingRole>;
  manageContext?: GuildMembersManageContext | null;
  onMembersChanged?: (input?: {
    memberId: string;
    actionId: GuildMemberRowActionId;
    propose: boolean;
  }) => void;
  loadError?: string | null;
  showListSkeleton?: boolean;
  isListRefreshing?: boolean;
  countsLoading?: boolean;
  onRetry?: () => void;
  showToolbar?: boolean;
  roleFilter?: GuildMemberRoleFilter;
  onRoleFilterChange?: (filter: GuildMemberRoleFilter) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}

export function GuildMembersRoster({
  groupId,
  members,
  banned = [],
  profiles,
  pendingRolesByMemberId,
  manageContext,
  onMembersChanged,
  loadError,
  showListSkeleton = false,
  isListRefreshing = false,
  countsLoading = false,
  onRetry,
  showToolbar = true,
  roleFilter: roleFilterProp,
  onRoleFilterChange,
  query: queryProp,
  onQueryChange,
}: GuildMembersRosterProps) {
  const [internalRoleFilter, setInternalRoleFilter] =
    useState<GuildMemberRoleFilter>('all');
  const [internalQuery, setInternalQuery] = useState('');

  const roleFilter = roleFilterProp ?? internalRoleFilter;
  const setRoleFilter = onRoleFilterChange ?? setInternalRoleFilter;
  const query = queryProp ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const showBannedFilter = Boolean(
    manageContext && canViewerManageGuildMembers(manageContext)
  );
  const listMode = roleFilter === 'banned' ? 'banned' : 'members';

  const filteredMembers = useMemo(() => {
    if (roleFilter === 'banned') {
      return bannedRowsAsMemberRows(banned, groupId).filter((member) =>
        guildMemberMatchesSearch(member, profiles[member.memberId], query)
      );
    }
    return filterGuildMembers(members, profiles, { roleFilter, query });
  }, [banned, groupId, members, profiles, query, roleFilter]);

  const emptyCopy = useMemo(() => {
    if (roleFilter === 'banned') {
      if (banned.length === 0) {
        return { primary: 'No banned members', secondary: null };
      }
      if (query.trim()) {
        return {
          primary: 'No matching bans',
          secondary: 'Try a different name or handle.',
        };
      }
      return { primary: 'No banned members', secondary: null };
    }
    if (members.length === 0) {
      return { primary: 'No members yet', secondary: null };
    }
    if (query.trim()) {
      return {
        primary: 'No matching members',
        secondary: 'Try a different name or handle.',
      };
    }
    if (roleFilter !== 'all') {
      const tierLabel =
        roleFilter === 'member'
          ? 'regular members'
          : guildMemberFilterLabel(roleFilter).toLowerCase();
      return {
        primary: `No ${tierLabel} yet`,
        secondary: null,
      };
    }
    return { primary: 'No members yet', secondary: null };
  }, [banned.length, members.length, query, roleFilter]);

  const toolbarInBody = showToolbar && roleFilterProp === undefined;
  const sourceEmpty =
    roleFilter === 'banned' ? banned.length === 0 : members.length === 0;
  const showEmptyState =
    !showListSkeleton &&
    !loadError &&
    filteredMembers.length === 0 &&
    (sourceEmpty || roleFilter !== 'all' || query.trim().length > 0);
  const showMemberList = !showListSkeleton && filteredMembers.length > 0;

  return (
    <div className="standing-panel guild-members-roster">
      {toolbarInBody ? (
        <GuildMembersToolbar
          members={members}
          bannedCount={banned.length}
          showBannedFilter={showBannedFilter}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          query={query}
          onQueryChange={setQuery}
          countsLoading={countsLoading}
        />
      ) : null}

      {loadError && members.length === 0 && banned.length === 0 ? (
        <div className="standing-panel-error-block">
          <p className="standing-panel-error">
            {loadError ?? 'Could not load members.'}
          </p>
          {onRetry ? (
            <button
              type="button"
              className="standing-panel-error-retry"
              onClick={onRetry}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`standing-panel-body${
          isListRefreshing && !showListSkeleton ? ' is-refreshing' : ''
        }`}
      >
        {showListSkeleton ? (
          <ProfileSocialListSkeleton rowVariant="guild-member" />
        ) : null}

        {showEmptyState ? (
          <div
            className={`standing-panel-empty-block${
              query.trim() ? ' is-search' : ''
            }`}
          >
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">{emptyCopy.primary}</p>
              {emptyCopy.secondary ? (
                <p className="standing-panel-empty-secondary">
                  {emptyCopy.secondary}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {showMemberList ? (
          <GuildMemberList
            groupId={groupId}
            members={filteredMembers}
            profiles={profiles}
            pendingRolesByMemberId={
              listMode === 'banned' ? undefined : pendingRolesByMemberId
            }
            manageContext={manageContext}
            listMode={listMode}
            onMembersChanged={onMembersChanged}
          />
        ) : null}
      </div>
    </div>
  );
}

export function GuildMembersRosterToolbar(props: {
  members: GroupMemberRow[];
  bannedCount?: number;
  showBannedFilter?: boolean;
  roleFilter: GuildMemberRoleFilter;
  onRoleFilterChange: (filter: GuildMemberRoleFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  countsLoading?: boolean;
}) {
  return <GuildMembersToolbar {...props} />;
}

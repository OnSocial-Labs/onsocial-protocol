'use client';

import { SearchField, osFloatingPanelCountClassName } from '@onsocial/ui';
import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@onsocial/ui';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  countGuildMembersByRoleFilter,
  GUILD_MEMBER_ROLE_FILTERS,
  type GuildMemberRoleFilter,
} from '@/features/guilds/guild-member-filter';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

function CountBadge({
  count,
  loading = false,
}: {
  count: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <span
        className={`${osFloatingPanelCountClassName} os-floating-panel-count--loading standing-row-shimmer os-floating-panel-count--standing`}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`${osFloatingPanelCountClassName} os-floating-panel-count--standing${
        count === 0 ? ' is-zero' : ''
      }`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

interface GuildMembersToolbarProps {
  members: GroupMemberRow[];
  bannedCount?: number;
  roleFilter: GuildMemberRoleFilter;
  onRoleFilterChange: (filter: GuildMemberRoleFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  countsLoading?: boolean;
  /** When false, hide the Banned filter (non-managers). */
  showBannedFilter?: boolean;
}

export function GuildMembersToolbar({
  members,
  bannedCount = 0,
  roleFilter,
  onRoleFilterChange,
  query,
  onQueryChange,
  countsLoading = false,
  showBannedFilter = false,
}: GuildMembersToolbarProps) {
  const options: ChoiceOption<GuildMemberRoleFilter>[] =
    GUILD_MEMBER_ROLE_FILTERS.filter(
      (option) => option.id !== 'banned' || showBannedFilter
    ).map((option) => ({
      value: option.id,
      label: option.label,
      leading: (
        <CountBadge
          count={countGuildMembersByRoleFilter(
            members,
            option.id,
            bannedCount
          )}
          loading={countsLoading}
        />
      ),
    }));

  return (
    <div className="standing-list-toolbar guild-members-toolbar">
      <ChoiceDrawerMenu
        label="Members"
        value={roleFilter}
        options={options}
        onChange={onRoleFilterChange}
        triggerMeta={
          <CountBadge
            count={countGuildMembersByRoleFilter(
              members,
              roleFilter,
              bannedCount
            )}
            loading={countsLoading}
          />
        }
        className="standing-view-menu"
      />

      <SearchField
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search members"
        maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
        clearAriaLabel="Clear member search"
        ariaLabel="Search guild members"
        chrome="floating-panel"
        className="standing-list-toolbar-search"
      />
    </div>
  );
}

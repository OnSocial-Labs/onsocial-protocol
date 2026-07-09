'use client';

import {
  ChevronDownIcon,
  FloatingPanelMenu,
  osFloatingPanelBodyClassName,
  osFloatingPanelCountClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
  useDropdown,
} from '@onsocial/ui';
import type { GroupMemberRow } from '@onsocial/sdk';
import { SearchField } from '@/components/ui/search-field';
import {
  countGuildMembersByRoleFilter,
  GUILD_MEMBER_ROLE_FILTERS,
  guildMemberFilterLabel,
  type GuildMemberRoleFilter,
} from '@/features/guilds/guild-member-filter';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

function CountBadge({
  count,
  loading = false,
  inTrigger = false,
}: {
  count: number;
  loading?: boolean;
  inTrigger?: boolean;
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
      }${inTrigger ? '' : ''}`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

interface GuildMembersToolbarProps {
  members: GroupMemberRow[];
  roleFilter: GuildMemberRoleFilter;
  onRoleFilterChange: (filter: GuildMemberRoleFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  countsLoading?: boolean;
}

export function GuildMembersToolbar({
  members,
  roleFilter,
  onRoleFilterChange,
  query,
  onQueryChange,
  countsLoading = false,
}: GuildMembersToolbarProps) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const activeLabel = guildMemberFilterLabel(roleFilter);
  const activeCount = countGuildMembersByRoleFilter(members, roleFilter);
  const menuLabel = 'Members';

  return (
    <div className="standing-list-toolbar guild-members-toolbar">
      <div className="standing-view-menu" ref={containerRef}>
        <button
          type="button"
          className={`${osFloatingPanelTriggerClassName}${isOpen ? ' is-open' : ''}`}
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={
            isOpen
              ? `Close ${menuLabel.toLowerCase()} menu`
              : `Open ${menuLabel.toLowerCase()} menu`
          }
        >
          <span className={osFloatingPanelTriggerLabelClassName}>
            {activeLabel}
          </span>
          <span className={osFloatingPanelTriggerMetaClassName}>
            <CountBadge count={activeCount} loading={countsLoading} inTrigger />
            <ChevronDownIcon
              className={`${osFloatingPanelTriggerChevronClassName}${
                isOpen ? ' is-open' : ''
              }`}
              aria-hidden
            />
          </span>
        </button>

        <FloatingPanelMenu
          ref={panelRef}
          open={isOpen}
          align="left"
          offset="sm"
          className="standing-view-menu-panel"
          role="listbox"
          aria-label={menuLabel}
        >
          <div className={osFloatingPanelHeaderClassName}>
            <p className={osFloatingPanelHeaderLabelClassName}>{menuLabel}</p>
            <p className={osFloatingPanelHeaderActiveClassName}>
              {activeLabel}
            </p>
          </div>

          <div className={osFloatingPanelBodyClassName}>
            {GUILD_MEMBER_ROLE_FILTERS.map((option) => {
              const selected = option.id === roleFilter;
              const count = countGuildMembersByRoleFilter(members, option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${osFloatingPanelItemClassName}${
                    selected ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    onRoleFilterChange(option.id);
                    close();
                  }}
                >
                  <span>{option.label}</span>
                  <CountBadge count={count} loading={countsLoading} />
                </button>
              );
            })}
          </div>
        </FloatingPanelMenu>
      </div>

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

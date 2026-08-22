'use client';

import { useState } from 'react';
import { ChevronDownIcon } from '@onsocial/ui';
import { GuildSummaryCard } from '@/features/guilds/guild-summary-card';
import { PAGE_DRAWER_GUILD_PEEK } from '@/lib/page-sections';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';

/** Membership peeks — stacked discovery rows, same language as Discover. */
export function PageDrawerGuilds({ guilds }: { guilds: ProfileGuildSummary[] }) {
  const [expanded, setExpanded] = useState(false);

  if (guilds.length === 0) {
    return null;
  }

  const peek = guilds.slice(0, PAGE_DRAWER_GUILD_PEEK);
  const overflow = Math.max(0, guilds.length - peek.length);
  const visible = expanded ? guilds : peek;

  return (
    <div className="page-drawer-peek-stack">
      <div className="page-drawer-guild-list" aria-label="Guilds">
        {visible.map((guild) => (
          <GuildSummaryCard
            key={guild.groupId}
            variant="grid"
            guild={guild}
          />
        ))}
      </div>

      {overflow > 0 ? (
        <button
          type="button"
          className="page-drawer-section-action"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer guilds' : `See all guilds · +${overflow}`}
          {/* Chevron (not arrow): expands in place instead of navigating. */}
          <ChevronDownIcon
            className={`page-drawer-section-action-chevron${
              expanded ? ' is-open' : ''
            }`}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

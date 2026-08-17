'use client';

import { useState } from 'react';
import { GuildSummaryCard } from '@/features/guilds/guild-summary-card';
import { PAGE_DRAWER_GUILD_PEEK } from '@/lib/page-sections';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';

/** Membership peeks — discovery-row cards in a shared media rail; expand stays on-page. */
export function PageDrawerGuilds({ guilds }: { guilds: ProfileGuildSummary[] }) {
  const [expanded, setExpanded] = useState(false);

  if (guilds.length === 0) {
    return null;
  }

  const peek = guilds.slice(0, PAGE_DRAWER_GUILD_PEEK);
  const overflow = Math.max(0, guilds.length - peek.length);
  const visible = expanded ? guilds : peek;
  const useRail = !expanded && visible.length > 1;

  return (
    <div className="page-drawer-peek-stack">
      {useRail ? (
        <div className="page-drawer-media-rail" aria-label="Guilds">
          {visible.map((guild) => (
            <GuildSummaryCard
              key={guild.groupId}
              variant="rail"
              guild={guild}
            />
          ))}
        </div>
      ) : (
        <div className="page-drawer-guild-list" aria-label="Guilds">
          {visible.map((guild) => (
            <GuildSummaryCard
              key={guild.groupId}
              variant="grid"
              guild={guild}
            />
          ))}
        </div>
      )}

      {overflow > 0 ? (
        <button
          type="button"
          className="page-drawer-section-action"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer guilds' : `See all guilds · +${overflow}`}
        </button>
      ) : null}
    </div>
  );
}

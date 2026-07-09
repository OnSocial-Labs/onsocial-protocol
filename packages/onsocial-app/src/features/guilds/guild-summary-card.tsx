import Link from 'next/link';
import {
  formatGuildMemberCount,
  guildCardMetaTags,
  guildDisplayName,
  type GuildCardRole,
} from '@/features/guilds/guild-card-display';
import { guildCoverClassName } from '@/features/guilds/guild-visual';
import { guildPath } from '@/features/guilds/guilds-data';

export interface GuildSummaryCardModel {
  groupId: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  memberCount?: number | null;
  role?: GuildCardRole | null;
}

function GuildCardPills({
  role,
  accessGated,
  memberDriven,
}: {
  role?: GuildCardRole | null;
  accessGated: boolean;
  memberDriven: boolean;
}) {
  const tags = guildCardMetaTags({ role, accessGated, memberDriven });

  return (
    <span className="guild-card-pills">
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`guild-card-pill${
            tag.tone ? ` guild-card-pill--${tag.tone}` : ''
          }`}
        >
          {tag.label}
        </span>
      ))}
    </span>
  );
}

export function GuildSummaryCard({
  guild,
  variant = 'grid',
}: {
  guild: GuildSummaryCardModel;
  variant?: 'rail' | 'grid';
}) {
  const displayName = guildDisplayName(guild.name, guild.groupId);

  return (
    <Link
      className={`guild-summary-card guild-summary-card--${variant}`}
      href={guildPath(guild.groupId)}
      scroll={false}
    >
      <div
        className={guildCoverClassName(guild.bannerUrl)}
        aria-hidden
      >
        {guild.bannerUrl ? (
          <img src={guild.bannerUrl} alt="" />
        ) : null}
      </div>
      <span className="guild-summary-card-body">
        <span className="guild-summary-card-name">{displayName}</span>
        {guild.description ? (
          <span className="guild-summary-card-copy">{guild.description}</span>
        ) : null}
        <span className="guild-summary-card-meta">
          {guild.memberCount != null ? (
            <span className="guild-summary-card-stat">
              {formatGuildMemberCount(guild.memberCount)}
            </span>
          ) : null}
          <GuildCardPills
            role={guild.role}
            accessGated={guild.accessGated}
            memberDriven={guild.memberDriven}
          />
        </span>
      </span>
    </Link>
  );
}

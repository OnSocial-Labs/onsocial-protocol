'use client';

import Link from 'next/link';
import {
  formatGuildMemberCountParts,
  guildCardMetaTags,
  guildDisplayName,
  type GuildCardRole,
} from '@/features/guilds/guild-card-display';
import {
  guildCoverClassName,
  guildCoverStyle,
} from '@/features/guilds/guild-visual';
import { guildPath } from '@/features/guilds/guilds-data';
import { topicLabel } from '@/lib/topic-slug';

export interface GuildSummaryCardModel {
  groupId: string;
  name: string | null;
  description: string | null;
  /** Banner (or seeded fallback) — guilds are places, not people; no crest. */
  bannerUrl: string | null;
  /** Small identity mark beside the name when set. */
  badgeUrl?: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  memberCount?: number | null;
  /** Topics — max two; first is primary (card shows primary only). */
  topics?: string[];
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
  const tags = guildCardMetaTags({
    role,
    accessGated,
    memberDriven,
  });

  if (tags.length === 0) return null;

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

function GuildMemberStat({ count }: { count: number }) {
  const { value, label } = formatGuildMemberCountParts(count);

  return (
    <span className="guild-summary-card-stat">
      <span className="guild-summary-card-stat-count">{value}</span>
      <span className="guild-summary-card-stat-label">{label}</span>
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
  const primaryTopic = guild.topics?.[0]
    ? (topicLabel(guild.topics[0]) ?? guild.topics[0])
    : null;
  const description = guild.description?.trim() || null;
  /** Rail thumbs prefer badge (square mark); discovery grid keeps banner cover. */
  const coverUrl =
    variant === 'rail'
      ? (guild.badgeUrl ?? guild.bannerUrl)
      : guild.bannerUrl;
  const showDescription = variant === 'grid' && Boolean(description);
  /** Rail: one quiet meta line — topic · members; role/gated pills stay on grid. */
  const showPills = variant === 'grid';

  return (
    <Link
      className={`guild-summary-card guild-summary-card--${variant}`}
      href={guildPath(guild.groupId)}
      scroll={false}
    >
      <span className="guild-summary-card-media" aria-hidden>
        <span
          className={guildCoverClassName(coverUrl)}
          style={guildCoverStyle(coverUrl, guild.groupId)}
        >
          {coverUrl ? <img src={coverUrl} alt="" /> : null}
        </span>
      </span>

      <span className="guild-summary-card-body">
        <span className="guild-summary-card-name-row">
          {variant === 'grid' && guild.badgeUrl ? (
            <span className="guild-summary-card-badge" aria-hidden>
              <img src={guild.badgeUrl} alt="" />
            </span>
          ) : null}
          <span className="guild-summary-card-name">{displayName}</span>
        </span>
        {showDescription ? (
          <span className="guild-summary-card-copy">{description}</span>
        ) : null}
        <span className="guild-summary-card-meta">
          {primaryTopic ? (
            <span className="guild-card-pill guild-card-pill--topic">
              {primaryTopic}
            </span>
          ) : null}
          {guild.memberCount != null ? (
            <GuildMemberStat count={guild.memberCount} />
          ) : null}
          {showPills ? (
            <GuildCardPills
              role={guild.role}
              accessGated={guild.accessGated}
              memberDriven={guild.memberDriven}
            />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { CommunityDiscoverRow } from '@/components/community-cards';
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
  badgeUrl: string | null;
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

  if (variant === 'grid') {
    return (
      <CommunityDiscoverRow
        href={guildPath(guild.groupId)}
        seedId={guild.groupId}
        bannerUrl={guild.bannerUrl}
        markUrl={guild.badgeUrl}
        markVariant="badge"
        reserveMark
        title={displayName}
        description={description}
        meta={
          <>
            {primaryTopic ? (
              <span className="guild-card-pill guild-card-pill--topic">
                {primaryTopic}
              </span>
            ) : null}
            {guild.memberCount != null ? (
              <GuildMemberStat count={guild.memberCount} />
            ) : null}
            <GuildCardPills
              role={guild.role}
              accessGated={guild.accessGated}
              memberDriven={guild.memberDriven}
            />
          </>
        }
      />
    );
  }

  /** Rail thumbs prefer badge (square mark); portfolio peeks stay compact. */
  const coverUrl = guild.badgeUrl ?? guild.bannerUrl;

  return (
    <Link
      className="guild-summary-card guild-summary-card--rail"
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
          <span className="guild-summary-card-name">{displayName}</span>
        </span>
        <span className="guild-summary-card-meta">
          {primaryTopic ? (
            <span className="guild-card-pill guild-card-pill--topic">
              {primaryTopic}
            </span>
          ) : null}
          {guild.memberCount != null ? (
            <GuildMemberStat count={guild.memberCount} />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

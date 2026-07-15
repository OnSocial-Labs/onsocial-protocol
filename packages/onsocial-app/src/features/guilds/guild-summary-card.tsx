import Link from 'next/link';
import {
  formatGuildMemberCountParts,
  guildCardMetaTags,
  guildDisplayInitials,
  guildDisplayName,
  type GuildCardRole,
} from '@/features/guilds/guild-card-display';
import { GUILD_MAX_TAGS } from '@/features/guilds/guild-config';
import {
  guildAvatarFillStyle,
  guildCoverClassName,
  guildCoverStyle,
  guildFallbackCoverStyle,
} from '@/features/guilds/guild-visual';
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
  /** Discover tags — max two; first is primary. */
  tags?: string[];
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

function GuildTopicTags({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, GUILD_MAX_TAGS);
  if (visible.length === 0) return null;

  return (
    <span className="guild-summary-card-tags">
      {visible.map((tag) => (
        <span key={tag}>#{tag}</span>
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
  const topicTags = guild.tags ?? [];

  return (
    <Link
      className={`guild-summary-card guild-summary-card--${variant}`}
      href={guildPath(guild.groupId)}
      scroll={false}
    >
      <div
        className={guildCoverClassName(guild.bannerUrl)}
        style={guildCoverStyle(guild.bannerUrl, guild.groupId)}
        aria-hidden
      >
        {guild.bannerUrl ? <img src={guild.bannerUrl} alt="" /> : null}
      </div>
        <span className="guild-summary-card-identity" aria-hidden>
          <span className="guild-summary-card-avatar-shell">
            <span
              className={`guild-summary-card-avatar${
                guild.avatarUrl
                  ? ' has-media'
                  : ' guild-summary-card-avatar--fallback'
              }`}
              style={
                guild.avatarUrl
                  ? guildAvatarFillStyle(guild.avatarUrl)
                  : guildFallbackCoverStyle(guild.groupId)
              }
            >
              {guild.avatarUrl ? null : (
                <span>{guildDisplayInitials(guild.name, guild.groupId)}</span>
              )}
            </span>
          </span>
        </span>
      <span className="guild-summary-card-body">
        <span className="guild-summary-card-name">{displayName}</span>
        {guild.description ? (
          <span className="guild-summary-card-copy">{guild.description}</span>
        ) : null}
        {variant === 'grid' ? <GuildTopicTags tags={topicTags} /> : null}
        <span className="guild-summary-card-meta">
          {guild.memberCount != null ? (
            <GuildMemberStat count={guild.memberCount} />
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

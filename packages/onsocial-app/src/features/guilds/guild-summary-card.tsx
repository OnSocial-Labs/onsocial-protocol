'use client';

import Link from 'next/link';
import { IpfsImg, ipfsImgSrcSet } from '@onsocial/ui';
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
import { useTranslations } from 'next-intl';
import { topicLabel } from '@/lib/topic-slug';
import { useCommunityTopicLabel } from '@/lib/use-shell';

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

function guildCardTagLabel(
  t: ReturnType<typeof useTranslations>,
  label: string
): string {
  switch (label) {
    case 'Open':
      return t('create.open');
    case 'Invite only':
      return t('create.inviteOnly');
    case 'Member-led':
      return t('guildCard.memberLed');
    case 'Owner':
      return t('guildCard.owner');
    case 'Admin':
      return t('guildCard.admin');
    case 'Moderator':
      return t('guildCard.moderator');
    default:
      return label;
  }
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
  const t = useTranslations('shell');
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
          {guildCardTagLabel(t, tag.label)}
        </span>
      ))}
    </span>
  );
}

function GuildMemberStat({ count }: { count: number }) {
  const t = useTranslations('shell');
  const { value } = formatGuildMemberCountParts(count);
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

  return (
    <span className="guild-summary-card-stat">
      <span className="guild-summary-card-stat-count">{value}</span>
      <span className="guild-summary-card-stat-label">
        {t('guildCard.members', { count: safe })}
      </span>
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
  const topicName = useCommunityTopicLabel();
  const rawTopic = guild.topics?.[0];
  const namedTopic = rawTopic ? topicName(rawTopic) : null;
  const primaryTopic = rawTopic
    ? namedTopic && namedTopic !== rawTopic
      ? namedTopic
      : (topicLabel(rawTopic) ?? rawTopic)
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
  const coverSrcSet = ipfsImgSrcSet(coverUrl, [128, 384]);

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
          {coverUrl ? (
            <IpfsImg
              src={coverUrl}
              srcSet={coverSrcSet}
              sizes={coverSrcSet ? '78px' : undefined}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}
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

'use client';

import type { ReactNode, Ref } from 'react';
import {
  InformationCircleIcon,
  ipfsImgSrcSet,
  ipfsImgVariantUrl,
} from '@onsocial/ui';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { GuildDescriptionClamp } from '@/features/guilds/guild-description-clamp';
import { guildAccessLabel } from '@/features/guilds/guild-facts';
import {
  guildCoverStyle,
  guildHeroCoverClassName,
} from '@/features/guilds/guild-visual';
import { topicLabel } from '@/lib/topic-slug';

export type GuildPageHeroLook = {
  name: string;
  bannerUrl: string | null;
  badgeUrl: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  description: string;
  topics: string[];
};

export function guildPageHeroLook(
  source: GuildPageHeroLook
): GuildPageHeroLook {
  return {
    name: source.name,
    bannerUrl: source.bannerUrl,
    badgeUrl: source.badgeUrl,
    accessGated: source.accessGated,
    memberDriven: source.memberDriven,
    description: source.description,
    topics: source.topics,
  };
}

export function GuildPageHeroSkeleton() {
  return (
    <div className="guild-loading-hero" aria-hidden>
      <div className="guild-loading-cover standing-row-shimmer" />
      <div className="guild-loading-identity">
        <div className="guild-loading-lines">
          <div className="standing-row-shimmer guild-loading-line" />
          <div className="standing-row-shimmer guild-loading-line-sm" />
        </div>
      </div>
    </div>
  );
}

/** Full-bleed hero — app column caps at 36rem on sm+, 100vw below. */
const GUILD_HERO_SIZES = '(max-width: 640px) 100vw, 576px';

/**
 * Presentational guild page hero. Callers own membership, facepile, and sheets.
 */
export function GuildPageHero({
  groupId,
  look,
  titleRef,
  leading = null,
  showFacts = false,
  onOpenFacts,
  membership = null,
  statusHint = null,
}: {
  groupId: string;
  look: GuildPageHeroLook;
  titleRef?: Ref<HTMLHeadingElement>;
  leading?: ReactNode;
  showFacts?: boolean;
  onOpenFacts?: () => void;
  membership?: ReactNode;
  statusHint?: string | null;
}) {
  const bannerSrcSet = ipfsImgSrcSet(look.bannerUrl, [1080, 1920]);
  const badgeSrc = look.badgeUrl
    ? (ipfsImgVariantUrl(look.badgeUrl, 128) ?? look.badgeUrl)
    : null;

  return (
    <section className="guild-hero">
      <div
        className={guildHeroCoverClassName(look.bannerUrl)}
        style={guildCoverStyle(look.bannerUrl, groupId)}
        aria-hidden
      >
        {look.bannerUrl ? (
          <img
            src={look.bannerUrl}
            srcSet={bannerSrcSet}
            sizes={bannerSrcSet ? GUILD_HERO_SIZES : undefined}
            alt=""
            decoding="async"
          />
        ) : null}
      </div>

      <div className="guild-hero-title-row">
        {badgeSrc ? (
          <span className="guild-hero-badge has-media" aria-hidden>
            <img src={badgeSrc} alt="" decoding="async" />
          </span>
        ) : null}
        <h2 ref={titleRef}>{guildDisplayName(look.name, groupId)}</h2>
      </div>

      <div className="guild-hero-meta">
        <div className="guild-hero-meta-main">
          {leading}
          <span className="guild-hero-mode-row">
            <span className="guild-hero-mode">
              {guildAccessLabel(look.accessGated, look.memberDriven)}
            </span>
            {showFacts ? (
              <button
                type="button"
                className="guild-hero-facts-button"
                aria-label="Guild facts"
                onClick={onOpenFacts}
              >
                <InformationCircleIcon
                  className="guild-hero-facts-icon"
                  aria-hidden
                />
              </button>
            ) : null}
          </span>
        </div>
        {membership ? (
          <div className="guild-hero-membership-slot">{membership}</div>
        ) : null}
      </div>

      {look.topics.length > 0 ? (
        <div className="guild-hero-tags" aria-label="Guild topics">
          {look.topics.map((tag) => (
            <span key={tag}>{topicLabel(tag) ?? tag}</span>
          ))}
        </div>
      ) : null}

      {look.description ? (
        <GuildDescriptionClamp text={look.description} />
      ) : null}

      {statusHint ? (
        <p className="guild-storage-gate-copy">{statusHint}</p>
      ) : null}
    </section>
  );
}

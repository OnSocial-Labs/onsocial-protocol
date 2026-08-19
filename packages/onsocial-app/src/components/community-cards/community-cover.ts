import type { CSSProperties } from 'react';
import {
  guildCoverClassName,
  guildCoverStyle,
  guildFallbackCoverStyle,
  guildHeroCoverClassName,
} from '@/features/guilds/guild-visual';

/**
 * Seeded place-cover wash — same visual language as guild banners.
 * `seedId` should be stable (group id, dao account, hub app id).
 */
export function communityCoverClassName(
  bannerUrl: string | null | undefined,
  sizing: 'discover' | 'mine' | 'hero' = 'discover'
): string {
  const base = guildHeroCoverClassName(bannerUrl);
  if (sizing === 'hero') return base;
  if (sizing === 'mine') return `${base} launcher-mine-banner-cover`;
  return guildCoverClassName(bannerUrl);
}

export function communityCoverStyle(
  bannerUrl: string | null | undefined,
  seedId: string
): CSSProperties | undefined {
  return guildCoverStyle(bannerUrl, seedId);
}

export function communityMineCoverStyle(
  bannerUrl: string | null | undefined,
  seedId: string
): CSSProperties | undefined {
  return bannerUrl ? undefined : guildFallbackCoverStyle(seedId);
}

import type { CSSProperties } from 'react';
import {
  communityCoverClassName,
  communityCoverStyle,
  hashPlaceSeed,
  placeFallbackCoverStyle,
  placeFallbackPalette,
  placeHeroCoverClassName,
  type PlaceFallbackPalette,
} from '@/components/community-cards/community-cover';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

/** Resolve guild banner IPFS CIDs the same way as guild detail + settings. */
export function guildMediaUrlFromCid(
  cid: string | null | undefined
): string | null {
  const trimmed = typeof cid === 'string' ? cid.trim() : '';
  return trimmed ? resolveProfileMediaUrl(`ipfs://${trimmed}`) : null;
}

/** Re-exports — wash helpers live in `community-cover`. */
export const hashGuildSeed = hashPlaceSeed;
export type GuildFallbackPalette = PlaceFallbackPalette;
export const guildFallbackPalette = placeFallbackPalette;
export const guildFallbackCoverStyle = placeFallbackCoverStyle;

export function guildHeroCoverClassName(
  bannerUrl: string | null | undefined
): string {
  return placeHeroCoverClassName(bannerUrl);
}

export function guildCoverClassName(
  bannerUrl: string | null | undefined
): string {
  return communityCoverClassName(bannerUrl, 'discover');
}

export function guildCoverStyle(
  bannerUrl: string | null | undefined,
  groupId: string
): CSSProperties | undefined {
  return communityCoverStyle(bannerUrl, groupId);
}

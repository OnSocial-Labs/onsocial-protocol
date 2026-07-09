import { resolveProfileMediaUrl } from '@/lib/profile-display';

/** Resolve guild avatar/banner IPFS CIDs the same way as guild detail + settings. */
export function guildMediaUrlFromCid(
  cid: string | null | undefined
): string | null {
  const trimmed = typeof cid === 'string' ? cid.trim() : '';
  return trimmed ? resolveProfileMediaUrl(`ipfs://${trimmed}`) : null;
}

/** Cover uses the protocol fallback gradient when no banner image is set. */
export function guildHeroCoverClassName(
  bannerUrl: string | null | undefined
): string {
  return bannerUrl
    ? 'guild-hero-cover'
    : 'guild-hero-cover guild-hero-cover--fallback';
}

/** Summary cards reuse hero cover + fallback, with card-specific sizing. */
export function guildCoverClassName(
  bannerUrl: string | null | undefined
): string {
  return `${guildHeroCoverClassName(bannerUrl)} guild-summary-card-cover`;
}

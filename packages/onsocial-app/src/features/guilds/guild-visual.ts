import type { CSSProperties } from 'react';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

/** Resolve guild banner IPFS CIDs the same way as guild detail + settings. */
export function guildMediaUrlFromCid(
  cid: string | null | undefined
): string | null {
  const trimmed = typeof cid === 'string' ? cid.trim() : '';
  return trimmed ? resolveProfileMediaUrl(`ipfs://${trimmed}`) : null;
}

/** Stable 32-bit seed from a guild id — same id always gets the same look. */
export function hashGuildSeed(groupId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < groupId.length; i += 1) {
    hash ^= groupId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Quiet accents — protocol + a few soft companions. */
const FALLBACK_ACCENTS = [
  'var(--protocol-purple)',
  'var(--protocol-green)',
  'var(--protocol-blue)',
  'oklch(0.62 0.12 28)',
  'oklch(0.58 0.1 195)',
  'oklch(0.6 0.11 325)',
  'oklch(0.56 0.09 95)',
  'oklch(0.57 0.1 255)',
] as const;

export type GuildFallbackPalette = {
  accent: string;
  spotX: string;
  spotY: string;
};

/** Deterministic single-hue wash so unset banners stay distinct per guild. */
export function guildFallbackPalette(groupId: string): GuildFallbackPalette {
  const seed = hashGuildSeed(groupId.trim() || 'guild');
  return {
    accent: FALLBACK_ACCENTS[seed % FALLBACK_ACCENTS.length]!,
    spotX: `${28 + (seed % 44)}%`,
    spotY: `${18 + ((seed >> 6) % 40)}%`,
  };
}

/** CSS variables consumed by `.guild-hero-cover--fallback`. */
export function guildFallbackCoverStyle(groupId: string): CSSProperties {
  const palette = guildFallbackPalette(groupId);
  return {
    ['--guild-fallback-accent' as string]: palette.accent,
    ['--guild-fallback-spot-x' as string]: palette.spotX,
    ['--guild-fallback-spot-y' as string]: palette.spotY,
  };
}

/** Cover uses a seeded fallback wash when no banner image is set. */
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

export function guildCoverStyle(
  bannerUrl: string | null | undefined,
  groupId: string
): CSSProperties | undefined {
  return bannerUrl ? undefined : guildFallbackCoverStyle(groupId);
}

import type { CSSProperties } from 'react';

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

export type PlaceFallbackPalette = {
  accent: string;
  spotX: string;
  spotY: string;
};

/** Stable 32-bit seed — same id always gets the same wash. */
export function hashPlaceSeed(seedId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seedId.length; i += 1) {
    hash ^= seedId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic single-hue wash so unset banners stay distinct per place. */
export function placeFallbackPalette(seedId: string): PlaceFallbackPalette {
  const seed = hashPlaceSeed(seedId.trim() || 'place');
  return {
    accent: FALLBACK_ACCENTS[seed % FALLBACK_ACCENTS.length]!,
    spotX: `${28 + (seed % 44)}%`,
    spotY: `${18 + ((seed >> 6) % 40)}%`,
  };
}

/**
 * CSS variables for `.guild-hero-cover--fallback` (shared by guild / hub heroes
 * and community place cards).
 */
export function placeFallbackCoverStyle(seedId: string): CSSProperties {
  const palette = placeFallbackPalette(seedId);
  return {
    ['--guild-fallback-accent' as string]: palette.accent,
    ['--guild-fallback-spot-x' as string]: palette.spotX,
    ['--guild-fallback-spot-y' as string]: palette.spotY,
  };
}

/** Hero / card cover base — image or seeded wash. */
export function placeHeroCoverClassName(
  bannerUrl: string | null | undefined
): string {
  return bannerUrl
    ? 'guild-hero-cover'
    : 'guild-hero-cover guild-hero-cover--fallback';
}

/**
 * Place-card cover class.
 * Discover thumbs use the OS catalog radius; Mine covers clip inside the tile.
 */
export function communityCoverClassName(
  bannerUrl: string | null | undefined,
  sizing: 'discover' | 'mine' | 'hero' = 'discover'
): string {
  const base = placeHeroCoverClassName(bannerUrl);
  if (sizing === 'hero') return base;
  if (sizing === 'mine') return `${base} launcher-mine-banner-cover`;
  return `${base} community-summary-cover`;
}

export function communityCoverStyle(
  bannerUrl: string | null | undefined,
  seedId: string
): CSSProperties | undefined {
  return bannerUrl ? undefined : placeFallbackCoverStyle(seedId);
}

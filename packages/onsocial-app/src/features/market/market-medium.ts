/**
 * Medium taxonomy for Market filters and holdings badges.
 * Kept in a server-safe module (no `'use client'`) so portfolio peeks can import it.
 *
 * Includes post-scarce kinds (`thought` / `video`) inferred at mint/list time,
 * plus drop templates (`art` / `writing` / `audio` / `ticket` / …).
 */

export type MarketMediumFilter =
  | 'all'
  | 'thought'
  | 'art'
  | 'writing'
  | 'audio'
  | 'video'
  | 'ticket'
  | 'coupon'
  | 'membership'
  | 'custom';

export const MARKET_MEDIUM_FILTERS: ReadonlyArray<{
  id: MarketMediumFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'thought', label: 'Thoughts' },
  { id: 'art', label: 'Art' },
  { id: 'writing', label: 'Writing' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'ticket', label: 'Events' },
  { id: 'coupon', label: 'Coupons' },
  { id: 'membership', label: 'Memberships' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Playable-audio scarce kind. Writes are `audio` only; `music` remains a
 * temporary read alias for the one testnet drop until it is recreated.
 */
export function isAudioMediumKind(kind: string | null | undefined): boolean {
  const key = (kind ?? '').trim().toLowerCase();
  return key === 'audio' || key === 'music';
}

/** Normalize stored kind for filters (legacy `music` → `audio`). */
export function normalizeMediumKind(
  kind: string | null | undefined
): string | null {
  const key = (kind ?? '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'music') return 'audio';
  return key;
}

export function marketMediumLabel(
  mediumKind: string | null | undefined
): string | null {
  const key = normalizeMediumKind(mediumKind);
  if (!key) return null;
  const match = MARKET_MEDIUM_FILTERS.find((entry) => entry.id === key);
  return match?.label ?? key;
}

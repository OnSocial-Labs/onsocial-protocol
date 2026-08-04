/**
 * Medium taxonomy for Market filters and holdings badges.
 * Kept in a server-safe module (no `'use client'`) so portfolio peeks can import it.
 *
 * Includes post-scarce kinds (`thought` / `video`) inferred at mint/list time,
 * plus drop templates (`art` / `writing` / `music` / `ticket` / …).
 */

export type MarketMediumFilter =
  | 'all'
  | 'thought'
  | 'art'
  | 'writing'
  | 'music'
  | 'video'
  | 'ticket'
  | 'coupon'
  | 'membership';

export const MARKET_MEDIUM_FILTERS: ReadonlyArray<{
  id: MarketMediumFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'thought', label: 'Thoughts' },
  { id: 'art', label: 'Art' },
  { id: 'writing', label: 'Writing' },
  { id: 'music', label: 'Music' },
  { id: 'video', label: 'Video' },
  { id: 'ticket', label: 'Tickets' },
  { id: 'coupon', label: 'Coupons' },
  { id: 'membership', label: 'Memberships' },
];

export function marketMediumLabel(
  mediumKind: string | null | undefined
): string | null {
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (!key) return null;
  const match = MARKET_MEDIUM_FILTERS.find((entry) => entry.id === key);
  return match?.label ?? key;
}

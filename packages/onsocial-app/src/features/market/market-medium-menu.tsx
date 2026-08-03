'use client';

import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@/components/ui/choice-drawer';

export type MarketMediumFilter =
  | 'all'
  | 'art'
  | 'writing'
  | 'music'
  | 'ticket'
  | 'coupon'
  | 'membership';

export const MARKET_MEDIUM_FILTERS: ReadonlyArray<{
  id: MarketMediumFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'art', label: 'Art' },
  { id: 'writing', label: 'Writing' },
  { id: 'music', label: 'Music' },
  { id: 'ticket', label: 'Tickets' },
  { id: 'coupon', label: 'Coupons' },
  { id: 'membership', label: 'Memberships' },
];

const MEDIUM_OPTIONS: ChoiceOption<MarketMediumFilter>[] =
  MARKET_MEDIUM_FILTERS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

export function MarketMediumMenu({
  medium,
  onMediumChange,
  onOpenChange,
}: {
  medium: MarketMediumFilter;
  onMediumChange: (medium: MarketMediumFilter) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <ChoiceDrawerMenu
      label="Medium"
      value={medium}
      options={MEDIUM_OPTIONS}
      onChange={onMediumChange}
      onOpenChange={onOpenChange}
      className="standing-view-menu market-listing-sort-menu"
    />
  );
}

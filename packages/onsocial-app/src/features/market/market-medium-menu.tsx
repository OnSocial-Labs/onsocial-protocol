'use client';

import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@onsocial/ui';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';

export type { MarketMediumFilter };
export { MARKET_MEDIUM_FILTERS };

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

'use client';

import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@onsocial/ui';
import type { MarketListingSort } from '@/features/market/market-listings';

const SORT_OPTIONS: ChoiceOption<MarketListingSort>[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'ending', label: 'Ending soon' },
];

export function MarketListingSortMenu({
  sort,
  onSortChange,
  endingDisabled = false,
  onOpenChange,
}: {
  sort: MarketListingSort;
  onSortChange: (sort: MarketListingSort) => void;
  endingDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const options = SORT_OPTIONS.map((option) =>
    option.value === 'ending' && endingDisabled
      ? { ...option, disabled: true }
      : option
  );

  return (
    <ChoiceDrawerMenu
      label="Sort"
      value={sort}
      options={options}
      onChange={onSortChange}
      onOpenChange={onOpenChange}
      className="standing-view-menu market-listing-sort-menu"
    />
  );
}

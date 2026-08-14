'use client';

import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@onsocial/ui';
import {
  HUB_CATEGORY_FILTERS,
  type HubCategoryFilter,
} from '@/features/scarces/hub-categories';

const CATEGORY_OPTIONS: ChoiceOption<HubCategoryFilter>[] =
  HUB_CATEGORY_FILTERS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

export function AppsDirectoryCategoryMenu({
  category,
  onCategoryChange,
  onOpenChange,
}: {
  category: HubCategoryFilter;
  onCategoryChange: (category: HubCategoryFilter) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <ChoiceDrawerMenu
      label="Topic"
      value={category}
      options={CATEGORY_OPTIONS}
      onChange={onCategoryChange}
      onOpenChange={onOpenChange}
      className="standing-view-menu market-listing-sort-menu apps-directory-sort-menu"
    />
  );
}

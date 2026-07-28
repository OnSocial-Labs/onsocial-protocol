'use client';

import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@/components/ui/choice-drawer';
import {
  APPS_SORT_OPTIONS,
  type AppsDirectorySort,
} from '@/features/scarces/apps-directory';

const SORT_OPTIONS: ChoiceOption<AppsDirectorySort>[] = APPS_SORT_OPTIONS.map(
  (option) => ({ value: option.value, label: option.label })
);

export function AppsDirectorySortMenu({
  sort,
  onSortChange,
  onOpenChange,
}: {
  sort: AppsDirectorySort;
  onSortChange: (sort: AppsDirectorySort) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <ChoiceDrawerMenu
      label="Sort"
      value={sort}
      options={SORT_OPTIONS}
      onChange={onSortChange}
      onOpenChange={onOpenChange}
      className="standing-view-menu market-listing-sort-menu apps-directory-sort-menu"
    />
  );
}

'use client';

import { GiftFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { APP_DROP_CREATE_PATH } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';

interface DropsSearchHeadingProps {
  query?: string;
  onQueryChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  interactive?: boolean;
}

/** Search field — replaces Drops title (same slot as Market / Hubs). */
export function DropsSearchHeading({
  query = '',
  onQueryChange,
  onFocus,
  onBlur,
  interactive = true,
}: DropsSearchHeadingProps) {
  return (
    <OsAppChromeNavSearch
      value={query}
      onValueChange={
        interactive && onQueryChange ? onQueryChange : () => undefined
      }
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder="Search drops"
      clearAriaLabel="Clear search"
      ariaLabel="Search drops"
      idleClassName="discover-nav-search-field"
      leadingIcon={<GiftFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Primary create — Post-size header commit; Market lives in empty recovery. */
export function DropsHeadingActions() {
  return (
    <OsRowAction className="os-header-commit" href={APP_DROP_CREATE_PATH}>
      New drop
    </OsRowAction>
  );
}

export function DropsLoadingActions() {
  return <DropsHeadingActions />;
}

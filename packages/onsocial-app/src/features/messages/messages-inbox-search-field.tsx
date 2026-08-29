'use client';

import { MessageFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const SEARCH_PLACEHOLDER_IDLE = 'Search';
const SEARCH_ARIA_LABEL = 'Search conversations or OnSocial';

export function MessagesInboxSearchField({
  value,
  onValueChange,
  onActiveChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  return (
    <OsAppChromeNavSearch
      value={value}
      onValueChange={onValueChange}
      onActiveChange={onActiveChange}
      placeholder={SEARCH_PLACEHOLDER_IDLE}
      maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
      clearAriaLabel="Clear search"
      ariaLabel={SEARCH_ARIA_LABEL}
      idleClassName="discover-nav-search-field messages-inbox-search"
      leadingIcon={<MessageFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

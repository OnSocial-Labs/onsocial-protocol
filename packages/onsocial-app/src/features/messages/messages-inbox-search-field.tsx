'use client';

import { SearchField } from '@onsocial/ui';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

export function MessagesInboxSearchField({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <SearchField
      value={value}
      onValueChange={onValueChange}
      placeholder="Search conversations or people"
      maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
      clearAriaLabel="Clear search"
      ariaLabel="Search conversations or people"
      chrome="floating-panel"
      className="messages-inbox-search os-app-screen-search"
    />
  );
}

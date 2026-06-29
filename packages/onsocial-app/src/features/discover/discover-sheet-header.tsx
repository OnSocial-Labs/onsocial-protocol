'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { SearchField } from '@/components/ui/search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

export function DiscoverSheetHeader() {
  const { shellVariant, subtitle, query, setQuery } = useDiscoverPanel();
  const close = useOverlayDismiss();
  const showClose = shellVariant === 'overlay';

  return (
    <div className="standing-sheet-header discover-sheet-header">
      <div className="discover-sheet-title-row">
        <div className="discover-sheet-heading">
          <p className="discover-sheet-title" aria-hidden="true">
            Discover
          </p>
          {subtitle ? (
            <p className="discover-sheet-subtitle">{subtitle}</p>
          ) : null}
        </div>
        {showClose ? (
          <SheetCloseButton onClick={close} ariaLabel="Close Discover" />
        ) : null}
      </div>

      <div className="glass-sheet-toolbar-row">
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder="Search names or accounts"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear profile search"
          ariaLabel="Search discover profiles"
          className="standing-list-toolbar-search"
        />
      </div>
    </div>
  );
}

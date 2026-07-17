'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';

export function DiscoverSheetHeader() {
  const { shellVariant } = useDiscoverPanel();
  const close = useOverlayDismiss();
  const showClose = shellVariant === 'overlay';

  return (
    <div className="standing-sheet-header discover-sheet-header">
      <div className="discover-sheet-nav-row">
        <DiscoverNavSearch className="discover-nav-search-field standing-list-toolbar-search" />
        {showClose ? (
          <SheetCloseButton onClick={close} ariaLabel="Close Discover" />
        ) : null}
      </div>
      <DiscoverHeaderTabs />
    </div>
  );
}

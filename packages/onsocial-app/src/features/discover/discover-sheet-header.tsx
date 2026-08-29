'use client';

import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
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
    <SheetChromeHeader
      className="discover-sheet-header"
      rowClassName="discover-sheet-nav-row"
      onClose={showClose ? close : undefined}
      closeAriaLabel="Close Discover"
      toolbar={<DiscoverHeaderTabs />}
      toolbarClassName={null}
    >
      <DiscoverNavSearch className="discover-nav-search-field standing-list-toolbar-search" />
    </SheetChromeHeader>
  );
}

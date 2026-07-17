'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { DiscoverOmniSearchField } from '@/features/discover/discover-omni-search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';

export function DiscoverSheetHeader() {
  const { shellVariant, subtitle } = useDiscoverPanel();
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
        <DiscoverOmniSearchField className="standing-list-toolbar-search" />
      </div>
    </div>
  );
}

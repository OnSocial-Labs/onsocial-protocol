'use client';

import { useState } from 'react';
import { SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import { StandingListToolbar } from '@/components/panels/standing-list-toolbar';
import { StandingSheetSubject } from '@/components/panels/standing-sheet-subject';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';

export function StandingSheetHeader() {
  const close = useOverlayDismiss();
  const { scrollRootRef } = useStandingPanel();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const toolbarHidden = useDockAutoHide(viewMenuOpen, scrollRootRef ?? null);

  return (
    <div className="standing-sheet-header">
      <StandingSheetSubject
        trailing={
          <div className="standing-sheet-actions">
            <span className="standing-sheet-discover-slot">
              <StandingDiscoverLink variant="chrome" closeOverlay />
            </span>
            <SheetCloseButton onClick={close} ariaLabel="Close Standing" />
          </div>
        }
      />

      <div
        className={`os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail${
          toolbarHidden ? ' is-scroll-hidden' : ''
        }`}
      >
        <StandingListToolbar onViewMenuOpenChange={setViewMenuOpen} />
      </div>
    </div>
  );
}

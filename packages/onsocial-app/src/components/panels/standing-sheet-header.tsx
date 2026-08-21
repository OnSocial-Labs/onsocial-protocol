'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import { StandingListToolbar } from '@/components/panels/standing-list-toolbar';
import { StandingSheetSubject } from '@/components/panels/standing-sheet-subject';

export function StandingSheetHeader() {
  const close = useOverlayDismiss();

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

      <div className="standing-sheet-toolbar-row">
        <StandingListToolbar />
      </div>
    </div>
  );
}
